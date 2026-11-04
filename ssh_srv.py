#!/usr/bin/env python3
# /// script
# dependencies = [
#   "cryptography",
# ]
# ///
"""
目的: Pinggyトンネルを維持し、クライアント切断を検知して自動で待機状態に戻る。
機能: マルチプロセス監視、Ed25519署名、X25519/AES-GCM暗号化、個別排他tmux、Keepalive。

更新履歴:
001 2026-05-26 初版
002 2026-05-26 公開鍵暗号化送信を統合
003 2026-05-26 Pinggy切断時の自動再接続と再送を追加
004 2026-05-26 pty出力抑制と終了時q送信を追加
005 2026-05-26 プロセス終了待機処理の追加
006 2026-08-31 X25519 + AES-256-GCM 暗号方式移行
007 2026-10-10 サーバーEd25519署名追加およびクライアント鍵対話入力対応
008 2026-10-10 マルチプロセス化による切断検知と初期待機状態への自動復帰
009 2026-10-10 秘密鍵シリアライズによるpickleエラー解消
010 2026-10-19 Pinggy切断分離、SSHゾンビ完全撲滅、サーバー鍵固定化
011 2026-10-20 tmuxセッション個別化とss監視排除による複数srv完全排他対応
012 2026-10-26 PinggyトンネルKeepalive追加および送信先トピック可視化
013 2026-10-26 ntfy Cache:no ヘッダー削除によるメッセージ到達性確保
"""

import argparse
import base64
import hashlib
import json
import multiprocessing as mp
import os
import pty
import re
import select
import shutil
import signal
import subprocess
import sys
import termios
import time
import tty
import urllib.error
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

NTFY_BASE_URL = "https://ntfy.sh"
PINGGY_TTL_SECONDS = 3600
RECONNECT_DELAY_SECONDS = 5
HKDF_INFO = b"pinggy-ssh-x25519"
CHECK_INTERVAL_SECONDS = 2.0
DISCONNECT_THRESHOLD = 15


def generate_server_keys() -> tuple[str, str]:
    ret = ("", "")
    try:
        priv = ed25519.Ed25519PrivateKey.generate()
        priv_bytes = priv.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
        priv_b64 = base64.urlsafe_b64encode(priv_bytes).decode("ascii")

        pub_bytes = priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        pub_b64 = base64.urlsafe_b64encode(pub_bytes).decode("ascii")
        ret = (priv_b64, pub_b64)
    except Exception as exc:
        raise RuntimeError(f"サーバー鍵生成エラー: {exc}") from exc
    return ret


def parse_args() -> argparse.Namespace:
    ret_args = None
    try:
        parser = argparse.ArgumentParser(
            description="Pinggyトンネルを維持し、切断時に自動で待機復帰する"
        )
        parser.add_argument(
            "-k", "--pubkey", default="", help="クライアントX25519公開鍵(Base64)"
        )
        parser.add_argument(
            "-s", "--subject", default="Pinggy URL", help="送信タイトル"
        )
        parser.add_argument(
            "--session", default="", help="排他用tmuxセッション名(省略時は鍵から自動導出)"
        )
        ret_args = parser.parse_args()
    except Exception as exc:
        raise RuntimeError(f"引数パースエラー: {exc}") from exc
    return ret_args


def acquire_client_pubkey(cli_arg_key: str, last_key: str = "") -> str:
    ret_key = ""
    try:
        target_key = cli_arg_key.strip()
        if not target_key:
            prompt = "クライアント公開鍵 (Base64) を入力してください ('q' で終了): "
            if last_key:
                prompt = (
                    f"クライアント公開鍵 (Base64) [Enterで前回値再利用] ('q' で終了): "
                )
            print(prompt, end="", file=sys.stderr, flush=True)
            line = sys.stdin.readline().strip()
            if not line and last_key:
                target_key = last_key
            else:
                target_key = line

        if target_key.lower() == "q":
            raise KeyboardInterrupt("ユーザーによる終了要求")

        raw = base64.urlsafe_b64decode(target_key)
        if len(raw) != 32:
            raise ValueError(f"鍵長不正 (期待値: 32B, 実測: {len(raw)}B)")
        ret_key = target_key
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        raise RuntimeError(f"クライアント公開鍵の検証失敗: {exc}") from exc
    return ret_key


def extract_url(text: str) -> str:
    ret_url = ""
    try:
        match = re.search(r"tcp://[a-zA-Z0-9.-]+:\d+", text)
        if match is None:
            raise ValueError("バッファ内にPinggyのTCP URLが見つからない")
        ret_url = match.group(0)
    except Exception:
        raise
    return ret_url


def encrypt_and_sign(
    server_priv_b64: str,
    client_pub_b64: str,
    message: str,
) -> str:
    ret_b64 = ""
    try:
        priv_bytes = base64.urlsafe_b64decode(server_priv_b64)
        if len(priv_bytes) != 32:
            raise ValueError("サーバー秘密鍵長が32バイトではない")
        server_priv = ed25519.Ed25519PrivateKey.from_private_bytes(priv_bytes)

        client_pub_bytes = base64.urlsafe_b64decode(client_pub_b64)
        if len(client_pub_bytes) != 32:
            raise ValueError("クライアント公開鍵長が32バイトではない")
        client_pub = x25519.X25519PublicKey.from_public_bytes(client_pub_bytes)

        ephem_priv = x25519.X25519PrivateKey.generate()
        ephem_pub_bytes = ephem_priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )

        shared_secret = ephem_priv.exchange(client_pub)
        aes_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_INFO,
        ).derive(shared_secret)

        nonce = os.urandom(12)
        ciphertext = AESGCM(aes_key).encrypt(nonce, message.encode("utf-8"), None)
        signed_payload = ephem_pub_bytes + nonce + ciphertext
        signature = server_priv.sign(signed_payload)
        packet = signature + signed_payload
        ret_b64 = base64.urlsafe_b64encode(packet).decode("ascii")
    except Exception as exc:
        raise RuntimeError(f"暗号化・署名エラー: {exc}") from exc
    return ret_b64


def build_headers(subject: str) -> dict:
    ret_headers = {}
    try:
        ret_headers = {
            "Content-Type": "text/plain; charset=utf-8",
        }
        if subject:
            ret_headers["Title"] = subject
    except Exception as exc:
        raise RuntimeError(f"ヘッダー構築エラー: {exc}") from exc
    return ret_headers


def send_ntfy(topic: str, headers: dict, message: str) -> dict:
    ret_dict = {}
    try:
        url = f"{NTFY_BASE_URL}/{topic}"
        req = urllib.request.Request(
            url, data=message.encode("utf-8"), headers=headers, method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            ret_dict = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTPエラー {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"接続エラー: {exc.reason}") from exc
    except Exception as exc:
        raise RuntimeError(f"送信処理エラー: {exc}") from exc
    return ret_dict


def send_url(
    server_priv_b64: str,
    client_pubkey: str,
    subject: str,
    url: str,
    session_name: str,
) -> None:
    ret_none = None
    try:
        topic = hashlib.sha256(client_pubkey.encode("ascii")).hexdigest()[:32]
        payload = encrypt_and_sign(server_priv_b64, client_pubkey, url)
        headers = build_headers(subject)

        result = send_ntfy(topic, headers, payload)
        message_id = result.get("id")
        print(
            f"送信完了 : id={message_id} トピック={topic} セッション={session_name} url={url}",
            file=sys.stderr,
        )
    except Exception:
        raise
    return ret_none


def count_session_clients(session_name: str) -> int:
    ret_count = 0
    try:
        if shutil.which("tmux"):
            res = subprocess.run(
                ["tmux", "list-clients", "-t", session_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
            if res.returncode == 0:
                lines = [line for line in res.stdout.strip().splitlines() if line]
                ret_count = len(lines)
    except Exception as exc:
        print(f"セッション接続数計測エラー: {exc}", file=sys.stderr)
    return ret_count


def run_monitor_worker(
    stop_event: mp.Event,
    tunnel_online: mp.Event,
    disconnect_event: mp.Event,
    session_name: str,
) -> None:
    ret_none = None
    try:
        has_connected = False
        zero_count = 0
        while not stop_event.is_set():
            if not tunnel_online.is_set():
                zero_count = 0
                time.sleep(CHECK_INTERVAL_SECONDS)
                continue

            active_count = count_session_clients(session_name)
            if not has_connected:
                if active_count > 0:
                    has_connected = True
                    zero_count = 0
                    print(
                        f"\n[+] クライアント接続を検知した (セッション: {session_name})",
                        file=sys.stderr,
                    )
            else:
                if active_count == 0:
                    zero_count += 1
                    if zero_count >= DISCONNECT_THRESHOLD:
                        print(
                            f"\n[!] クライアント切断を検知した (セッション: {session_name})",
                            file=sys.stderr,
                        )
                        disconnect_event.set()
                        break
                else:
                    zero_count = 0
            time.sleep(CHECK_INTERVAL_SECONDS)
    except Exception as exc:
        print(f"切断監視ワーカーエラー: {exc}", file=sys.stderr)
    return ret_none


def spawn_ssh() -> tuple[int, int, subprocess.Popen]:
    ret_tuple = None
    try:
        master_fd, slave_fd = pty.openpty()
        process = subprocess.Popen(
            [
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ServerAliveInterval=30",
                "-o",
                "ServerAliveCountMax=3",
                "-p",
                "443",
                "-R0:localhost:22",
                "tcp@a.pinggy.io",
            ],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            preexec_fn=os.setsid,
        )
        os.close(slave_fd)
        ret_tuple = (master_fd, slave_fd, process)
    except Exception as exc:
        raise RuntimeError(f"SSH起動エラー: {exc}") from exc
    return ret_tuple


def terminate_ssh_process(process: subprocess.Popen, master_fd: int) -> None:
    ret_none = None
    try:
        if process and process.pid:
            try:
                pgid = os.getpgid(process.pid)
                os.killpg(pgid, signal.SIGTERM)
                process.wait(timeout=1.5)
            except Exception:
                try:
                    pgid = os.getpgid(process.pid)
                    os.killpg(pgid, signal.SIGKILL)
                    process.wait(timeout=1.0)
                except Exception:
                    pass

        try:
            os.close(master_fd)
        except Exception:
            pass
    except Exception as exc:
        print(f"SSHプロセス終了エラー: {exc}", file=sys.stderr)
    return ret_none


def kill_by_pid(pid: int) -> None:
    ret_none = None
    try:
        if pid > 0:
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except Exception:
                try:
                    os.kill(pid, signal.SIGKILL)
                except Exception:
                    pass
    except Exception as exc:
        print(f"PID強制終了エラー: {exc}", file=sys.stderr)
    return ret_none


def run_tunnel_worker(
    server_priv_b64: str,
    client_pubkey: str,
    subject: str,
    session_name: str,
    stop_event: mp.Event,
    tunnel_online: mp.Event,
    current_ssh_pid: mp.Value,
) -> None:
    ret_none = None
    try:
        while not stop_event.is_set():
            tunnel_online.clear()
            master_fd, _, process = spawn_ssh()
            current_ssh_pid.value = process.pid
            buffer = ""
            url_sent = False
            started_at = time.time()

            try:
                while not stop_event.is_set():
                    if process.poll() is not None:
                        raise RuntimeError("Pinggy SSHプロセス終了検知")

                    if time.time() - started_at >= PINGGY_TTL_SECONDS:
                        raise RuntimeError("Pinggy TTL 到達 (定期再接続)")

                    rlist, _, _ = select.select([master_fd], [], [], 0.5)
                    if not rlist:
                        continue

                    data = os.read(master_fd, 4096).decode("utf-8", errors="ignore")
                    if data:
                        buffer += data

                    if not url_sent:
                        try:
                            url = extract_url(buffer)
                            print(f"\n[+] Pinggy TCP URL 検知: {url}\n", file=sys.stderr)
                            send_url(
                                server_priv_b64,
                                client_pubkey,
                                subject,
                                url,
                                session_name,
                            )
                            url_sent = True
                            tunnel_online.set()
                        except ValueError:
                            pass
            except Exception as exc:
                if not stop_event.is_set():
                    print(f"\n[!] トンネル瞬断/切断: {exc}", file=sys.stderr)
            finally:
                tunnel_online.clear()
                current_ssh_pid.value = 0
                terminate_ssh_process(process, master_fd)

            if not stop_event.is_set():
                print(f"[i] {RECONNECT_DELAY_SECONDS}秒後に再接続する", file=sys.stderr)
                time.sleep(RECONNECT_DELAY_SECONDS)
    except Exception as exc:
        print(f"トンネルワーカー全体エラー: {exc}", file=sys.stderr)
    return ret_none


def cleanup_workers(
    stop_event: mp.Event,
    tunnel_proc: mp.Process,
    monitor_proc: mp.Process,
    current_ssh_pid: mp.Value,
) -> None:
    ret_none = None
    try:
        stop_event.set()
        kill_by_pid(current_ssh_pid.value)

        for proc in (tunnel_proc, monitor_proc):
            if proc.is_alive():
                proc.join(timeout=1.5)
            if proc.is_alive():
                proc.terminate()
                proc.join(timeout=1.0)
            if proc.is_alive():
                proc.kill()
                proc.join()
    except Exception as exc:
        print(f"ワーカー回収エラー: {exc}", file=sys.stderr)
    return ret_none


def wait_session_events(
    stop_event: mp.Event,
    disconnect_event: mp.Event,
) -> bool:
    ret_quit = False
    old_settings = termios.tcgetattr(sys.stdin)
    try:
        tty.setcbreak(sys.stdin.fileno())
        print(
            "トンネルおよび切断監視稼働中... 終了するには 'q' を押す",
            file=sys.stderr,
        )

        while not disconnect_event.is_set():
            rlist, _, _ = select.select([sys.stdin], [], [], 0.5)
            if rlist:
                char = sys.stdin.read(1)
                if char.lower() == "q":
                    ret_quit = True
                    break
    except Exception as exc:
        print(f"セッション監視エラー: {exc}", file=sys.stderr)
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
    return ret_quit


def execute_session(
    server_priv_b64: str,
    client_pubkey: str,
    subject: str,
    session_name: str,
) -> bool:
    ret_quit = False
    stop_event = mp.Event()
    tunnel_online = mp.Event()
    disconnect_event = mp.Event()
    current_ssh_pid = mp.Value("i", 0)

    tunnel_proc = mp.Process(
        target=run_tunnel_worker,
        args=(
            server_priv_b64,
            client_pubkey,
            subject,
            session_name,
            stop_event,
            tunnel_online,
            current_ssh_pid,
        ),
    )
    monitor_proc = mp.Process(
        target=run_monitor_worker,
        args=(stop_event, tunnel_online, disconnect_event, session_name),
    )

    try:
        tunnel_proc.start()
        monitor_proc.start()
        ret_quit = wait_session_events(stop_event, disconnect_event)
    except Exception as exc:
        print(f"セッション実行中例外: {exc}", file=sys.stderr)
        ret_quit = True
    finally:
        cleanup_workers(stop_event, tunnel_proc, monitor_proc, current_ssh_pid)
    return ret_quit


def main() -> int:
    ret_code = 0
    try:
        args = parse_args()
        print("Pinggy SSH サーバー管理デーモンを起動した", file=sys.stderr)

        server_priv_b64, server_pub_b64 = generate_server_keys()
        print("==================================================", file=sys.stderr)
        print("【サーバー証明用公開鍵 (Base64)】", file=sys.stderr)
        print(f"{server_pub_b64}", file=sys.stderr)
        print("==================================================", file=sys.stderr)

        client_pubkey = ""
        while True:
            client_pubkey = acquire_client_pubkey(args.pubkey, last_key=client_pubkey)

            topic = hashlib.sha256(client_pubkey.encode("ascii")).hexdigest()[:32]
            session_name = args.session if args.session else f"pg_{topic[:8]}"
            print(f"[pinggy_ssh] ターゲットtmuxセッション: {session_name}", file=sys.stderr)
            print(f"[pinggy_ssh] 対象トピック: {topic}", file=sys.stderr)

            user_quit = execute_session(
                server_priv_b64, client_pubkey, args.subject, session_name
            )

            if user_quit:
                print("\n[+] ユーザー要求により正常終了した", file=sys.stderr)
                break

            print(
                "\n[i] クライアント切断を検知したため、初期待機状態へ復帰する...\n",
                file=sys.stderr,
            )
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n[!] 割り込み終了", file=sys.stderr)
    except Exception as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        ret_code = 1
    return ret_code


if __name__ == "__main__":
    sys.exit(main())
