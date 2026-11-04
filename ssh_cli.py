#!/usr/bin/env python3
# /// script
# dependencies = [
#   "cryptography",
#   "qrcode",
# ]
# ///
"""
目的: サーバーEd25519署名を検証し、安全にPinggy経由のSSHセッションを確立する。
機能: サーバー署名検証、poll=1によるURL取得、個別排他tmux、パススルー自動有効化、
      サーバーへの自動接続依頼(Ed25519署名付き・nonce照合)、再接続時の遅延リサイズ補正、
      通知されたsshdホスト鍵のピン留め(中間者攻撃対策)。

更新履歴:
001 2026-05-26 初版 (recv_msg.py 外部連携版)
002 2026-05-26 recv_msg.py 組み込みによる単一ファイル化
003 2026-05-26 再接続時に鍵を再生成しないように修正
004 2026-08-31 公開鍵の UTF-8 QRコード表示機能を追加
005 2026-08-31 X25519 移行および単一スクリプト化 (PEP 723 対応)
006 2026-10-05 trzsz/tssh ダウンロード保存先パス自動指定機能を追加
007 2026-10-10 サーバーEd25519公開鍵引数の必須化と署名検証機能の追加
008 2026-10-19 古いキャッシュURL破棄と最新Pinggy URL自動追従の実装
009 2026-10-20 tmuxセッション個別排他名(pg_<topic>)への動的アタッチ対応
010 2026-10-25 再接続時のtmuxリサイズ初期化(window-size latest, aggressive-resize, attach -d)
011 2026-10-26 デッドロック解消(現行URL優先再試行+Keepalive追加)
012 2026-10-26 ntfy poll=1 パラメータ追加による無限ストリームブロック解消
013 2026-10-29 yazi/Sixelプレビュー用tmuxパススルー自動有効化(allow-passthrough on)
014 2026-11-04 サーバーへの自動接続依頼(nonce付き)、指紋表示、SIGWINCH遅延送信
015 2026-11-04 resize-window -A がwindow-sizeをmanual固定する問題を修正
                (ループ廃止、attach前にwindow単位のwindow-size上書きを解除)
016 2026-11-04 通知のホスト鍵を一時known_hostsに書き出して厳格検証(StrictHostKeyChecking=yes)、
                --allow-unpinned 追加、nonce無し通知をフォールバック候補として受理
017 2026-11-04 接続依頼にEd25519識別鍵の署名を付与(サーバー鍵・X25519鍵・nonceに束縛)、
                指紋を識別鍵基準に変更
"""

import base64
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

RETRY_INTERVAL = 3
URL_PATTERN = re.compile(r"^tcp://([^:|]+):(\d+)$")
HOSTKEY_PATTERN = re.compile(r"^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$")
NTFY_BASE_URL = "https://ntfy.sh"
HKDF_INFO = b"pinggy-ssh-x25519"
REQUEST_SIGN_PREFIX = "pinggy-req-v1"
REQUEST_RESEND_SECONDS = 60
RESIZE_KICK_DELAYS = (0.8, 2.0, 4.0)


def parse_server_pubkey(key_b64: str) -> ed25519.Ed25519PublicKey:
    ret_key = None
    try:
        raw_bytes = base64.urlsafe_b64decode(key_b64.strip())
        if len(raw_bytes) != 32:
            raise ValueError(f"鍵長不正 (期待値: 32B, 実測: {len(raw_bytes)}B)")
        ret_key = ed25519.Ed25519PublicKey.from_public_bytes(raw_bytes)
    except Exception as e:
        raise RuntimeError(f"サーバー公開鍵の解析失敗: {e}")
    return ret_key


def generate_keys() -> tuple:
    ret_keys = (None, "", "")
    try:
        priv_key = x25519.X25519PrivateKey.generate()
        pub_bytes = priv_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        pub_b64 = base64.urlsafe_b64encode(pub_bytes).decode("ascii")
        topic = hashlib.sha256(pub_b64.encode("ascii")).hexdigest()[:32]
        ret_keys = (priv_key, pub_b64, topic)
    except Exception as e:
        raise RuntimeError(f"鍵生成エラー: {e}")
    return ret_keys


def generate_identity() -> tuple:
    ret_ident = (None, "")
    try:
        id_priv = ed25519.Ed25519PrivateKey.generate()
        pub_bytes = id_priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        id_b64 = base64.urlsafe_b64encode(pub_bytes).decode("ascii")
        ret_ident = (id_priv, id_b64)
    except Exception as e:
        raise RuntimeError(f"識別鍵生成エラー: {e}")
    return ret_ident


def build_request_topic(server_key_str: str) -> str:
    ret_topic = hashlib.sha256(
        ("req:" + server_key_str.strip()).encode("ascii")
    ).hexdigest()[:32]
    return ret_topic


def fingerprint(pubkey: str) -> str:
    ret_fp = hashlib.sha256(pubkey.encode("ascii")).hexdigest()[:16]
    return ret_fp


def display_qr_code(data: str) -> None:
    ret = None
    try:
        try:
            import qrcode

            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=1,
                border=1,
            )
            qr.add_data(data)
            qr.make(fit=True)
            qr.print_ascii(out=sys.stderr, tty=True)
        except ImportError:
            qrencode_bin = shutil.which("qrencode")
            if not qrencode_bin:
                raise RuntimeError("QR表示にはqrcodeモジュールまたはqrencodeが必要だ")
            res = subprocess.run(
                [qrencode_bin, "-t", "UTF8", "-l", "L", "-m", "1", data],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )
            print(res.stdout, file=sys.stderr)
    except Exception as e:
        raise RuntimeError(f"QRコード出力エラー: {e}")
    return ret


def decrypt_and_verify(
    priv_key: x25519.X25519PrivateKey,
    srv_pub: ed25519.Ed25519PublicKey,
    enc_b64: str,
) -> str:
    ret_text = ""
    try:
        raw_data = base64.urlsafe_b64decode(enc_b64)
        if len(raw_data) < 108:
            raise ValueError(f"データ長不正 (最低108B必要, 実測: {len(raw_data)}B)")

        signature = raw_data[:64]
        signed_payload = raw_data[64:]
        try:
            srv_pub.verify(signature, signed_payload)
        except InvalidSignature:
            raise ValueError("サーバー署名検証失敗 (改ざんまたは送信者不一致)")

        ephem_pub_bytes = signed_payload[:32]
        nonce = signed_payload[32:44]
        ciphertext = signed_payload[44:]

        ephem_pub = x25519.X25519PublicKey.from_public_bytes(ephem_pub_bytes)
        shared_secret = priv_key.exchange(ephem_pub)
        aes_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_INFO,
        ).derive(shared_secret)

        plaintext = AESGCM(aes_key).decrypt(nonce, ciphertext, None)
        ret_text = plaintext.decode("utf-8")
    except Exception as e:
        raise RuntimeError(f"復号・検証エラー: {e}")
    return ret_text


def build_request_body(
    server_key_str: str,
    id_priv: ed25519.Ed25519PrivateKey,
    id_b64: str,
    pub_b64: str,
    nonce: str,
) -> str:
    ret_body = ""
    try:
        sign_data = (
            f"{REQUEST_SIGN_PREFIX}|{server_key_str.strip()}|{id_b64}|{pub_b64}|{nonce}"
        ).encode("utf-8")
        sig = base64.urlsafe_b64encode(id_priv.sign(sign_data)).decode("ascii")
        ret_body = json.dumps(
            {"v": 2, "id": id_b64, "pub": pub_b64, "nonce": nonce, "sig": sig}
        )
    except Exception as e:
        raise RuntimeError(f"接続依頼の署名生成エラー: {e}")
    return ret_body


def send_connect_request(req_topic: str, body: str) -> None:
    ret = None
    try:
        req = urllib.request.Request(
            f"{NTFY_BASE_URL}/{req_topic}",
            data=body.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "Title": "connect request",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception as e:
        raise RuntimeError(f"接続依頼の送信失敗: {e}")
    return ret


def normalize_hostkey(hostkey: str, allow_unpinned: bool) -> tuple[bool, str]:
    ret = (False, "")
    try:
        if HOSTKEY_PATTERN.match(hostkey):
            ret = (True, hostkey)
        elif allow_unpinned:
            ret = (True, "")
    except Exception as e:
        raise RuntimeError(f"ホスト鍵検証エラー: {e}")
    return ret


def fetch_ntfy_url(
    priv_key: x25519.X25519PrivateKey,
    srv_pub: ed25519.Ed25519PublicKey,
    topic: str,
    nonce: str,
    allow_unpinned: bool,
) -> tuple[str, int, str]:
    ret_val = ("", 0, "")
    try:
        url = f"{NTFY_BASE_URL}/{topic}/json?poll=1&since=all"
        req = urllib.request.Request(url)
        matched = []
        fallback = []
        raw_msg_count = 0
        last_error = ""

        with urllib.request.urlopen(req, timeout=10) as resp:
            for line in resp:
                line_str = line.decode("utf-8").strip()
                if not line_str:
                    continue
                try:
                    msg = json.loads(line_str)
                    if msg.get("event", "message") != "message":
                        continue
                    raw_msg_count += 1
                    enc_body = msg.get("message", "")
                    dec_body = decrypt_and_verify(priv_key, srv_pub, enc_body)
                    parts = dec_body.split("|", 2)
                    got_nonce = parts[1] if len(parts) > 1 else ""
                    got_hostkey = parts[2] if len(parts) > 2 else ""
                    m = URL_PATTERN.match(parts[0])
                    if not m:
                        continue
                    ok, pinned = normalize_hostkey(got_hostkey, allow_unpinned)
                    if not ok:
                        last_error = "通知にピン留め用ホスト鍵が含まれていない"
                        continue
                    item = (m.group(1), int(m.group(2)), pinned)
                    if not nonce or got_nonce == nonce:
                        matched.append(item)
                    elif not got_nonce:
                        fallback.append(item)
                except json.JSONDecodeError:
                    continue
                except RuntimeError as err:
                    last_error = str(err)
                    continue

        candidates = matched if matched else fallback
        if candidates:
            ret_val = candidates[-1]
        else:
            if raw_msg_count > 0 and last_error:
                raise RuntimeError(
                    f"ntfyに {raw_msg_count}件受信したが採用不可: {last_error}"
                )
            raise RuntimeError(
                f"サーバー承認待ち (topic={topic}, 受信件数: {raw_msg_count})"
            )
    except Exception as e:
        raise RuntimeError(f"{e}")
    return ret_val


def build_tmux_cmd(session_name: str) -> str:
    ret_cmd = (
        f"if command -v tmux >/dev/null 2>&1; then "
        f"tmux has-session -t {session_name} 2>/dev/null || "
        f"tmux new-session -d -s {session_name} 'unset TMUX; exec $SHELL'; "
        f"tmux set-option -g allow-passthrough on 2>/dev/null; "
        f"tmux set-option -t {session_name} allow-passthrough on 2>/dev/null; "
        f"tmux set-option -ga update-environment TERM 2>/dev/null; "
        f"tmux set-option -ga update-environment TERM_PROGRAM 2>/dev/null; "
        f"tmux set-option -t {session_name} status off; "
        f"tmux set-option -t {session_name} prefix None; "
        f"tmux set-option -w -u -t {session_name} window-size 2>/dev/null; "
        f"tmux set-option -t {session_name} window-size latest; "
        f"tmux set-window-option -t {session_name} aggressive-resize on 2>/dev/null; "
        f"tmux attach-session -d -t {session_name}; "
        f"else exec $SHELL; fi"
    )
    return ret_cmd


def send_winch(proc: subprocess.Popen) -> None:
    ret = None
    try:
        if proc.poll() is None:
            proc.send_signal(signal.SIGWINCH)
    except Exception as e:
        print(f"[pinggy_ssh] SIGWINCH送信失敗: {e}", file=sys.stderr)
    return ret


def start_resize_kicks(proc: subprocess.Popen) -> list:
    ret_timers = []
    try:
        if hasattr(signal, "SIGWINCH"):
            for delay in RESIZE_KICK_DELAYS:
                timer = threading.Timer(delay, send_winch, args=(proc,))
                timer.daemon = True
                timer.start()
                ret_timers.append(timer)
    except Exception as e:
        raise RuntimeError(f"リサイズ補正タイマー起動エラー: {e}")
    return ret_timers


def cancel_timers(timers: list) -> None:
    ret = None
    try:
        for timer in timers:
            timer.cancel()
    except Exception as e:
        print(f"[pinggy_ssh] タイマー解除失敗: {e}", file=sys.stderr)
    return ret


def write_known_hosts(host: str, port: int, hostkey: str) -> str:
    ret_path = ""
    try:
        fd, path = tempfile.mkstemp(prefix="pg_kh_")
        with os.fdopen(fd, "w", encoding="ascii") as fp:
            fp.write(f"[{host}]:{port} {hostkey}\n")
        ret_path = path
    except Exception as e:
        raise RuntimeError(f"known_hosts作成エラー: {e}")
    return ret_path


def remove_file(path: str) -> None:
    ret = None
    try:
        if path:
            os.remove(path)
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"[pinggy_ssh] 一時ファイル削除失敗: {e}", file=sys.stderr)
    return ret


def build_hostkey_options(host: str, port: int, hostkey: str) -> tuple[list, str]:
    ret = ([], "")
    try:
        if hostkey:
            kh_path = write_known_hosts(host, port, hostkey)
            opts = [
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                f"UserKnownHostsFile={kh_path}",
                "-o",
                "GlobalKnownHostsFile=/dev/null",
                "-o",
                "HostKeyAlgorithms=ssh-ed25519",
            ]
            ret = (opts, kh_path)
        else:
            print(
                "[pinggy_ssh] 警告: ホスト鍵未ピン留めで接続する (中間者攻撃に無防備)",
                file=sys.stderr,
            )
            opts = [
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
            ]
            ret = (opts, "")
    except Exception as e:
        raise RuntimeError(f"ホスト鍵オプション構築エラー: {e}")
    return ret


def run_ssh(
    host: str,
    port: int,
    session_name: str,
    extra_args: list[str],
    download_path: str,
    use_tmux: bool = True,
    verbose: bool = False,
    hostkey: str = "",
) -> int:
    ret_code = -1
    proc = None
    timers = []
    kh_path = ""
    try:
        ssh_bin = shutil.which("tssh")
        if not ssh_bin:
            raise RuntimeError("tssh コマンドが見つかりません")

        hk_opts, kh_path = build_hostkey_options(host, port, hostkey)
        cmd = [ssh_bin] + hk_opts + [
            "-o",
            "ServerAliveInterval=15",
            "-o",
            "ServerAliveCountMax=3",
            "-p",
            str(port),
        ]
        if download_path:
            cmd += ["--download-path", download_path]
        cmd.append(host)

        if use_tmux:
            if "-t" not in extra_args and "-tt" not in extra_args:
                cmd.append("-t")
            tmux_script = build_tmux_cmd(session_name)
            cmd += extra_args + [tmux_script]
        else:
            cmd += extra_args

        if verbose:
            print(f"[pinggy_ssh] 実行: {' '.join(cmd)}", file=sys.stderr)

        proc = subprocess.Popen(cmd)
        if use_tmux:
            timers = start_resize_kicks(proc)
        ret_code = proc.wait()
    except KeyboardInterrupt:
        try:
            if proc is not None:
                proc.send_signal(signal.SIGINT)
                ret_code = proc.wait()
        except Exception:
            pass
    except Exception as e:
        raise RuntimeError(f"SSH実行エラー: {e}")
    finally:
        cancel_timers(timers)
        remove_file(kh_path)
    return ret_code


def parse_cli_args(
    raw_args: list[str],
) -> tuple[str, str, bool, bool, str, list[str], bool]:
    ret = ("", "", True, False, "", [], False)
    try:
        srv_key_str = ""
        session_arg = ""
        download_path = ""
        use_tmux = True
        verbose = False
        allow_unpinned = False
        extra_args = []

        i = 0
        while i < len(raw_args):
            arg = raw_args[i]
            if arg == "--server-pubkey":
                if i + 1 >= len(raw_args):
                    raise ValueError("--server-pubkey の値が指定されていない")
                srv_key_str = raw_args[i + 1]
                i += 2
            elif arg.startswith("--server-pubkey="):
                srv_key_str = arg.split("=", 1)[1]
                i += 1
            elif arg == "--session":
                if i + 1 >= len(raw_args):
                    raise ValueError("--session の値が指定されていない")
                session_arg = raw_args[i + 1]
                i += 2
            elif arg.startswith("--session="):
                session_arg = arg.split("=", 1)[1]
                i += 1
            elif arg == "--download-path":
                if i + 1 >= len(raw_args):
                    raise ValueError("--download-path の値が指定されていない")
                download_path = os.path.abspath(os.path.expanduser(raw_args[i + 1]))
                i += 2
            elif arg == "--no-tmux":
                use_tmux = False
                i += 1
            elif arg == "--allow-unpinned":
                allow_unpinned = True
                i += 1
            elif arg == "--verbose" or arg in ("-v", "-vv", "-vvv"):
                verbose = True
                i += 1
            else:
                extra_args.append(arg)
                i += 1

        if not srv_key_str:
            raise ValueError(
                "必須引数エラー: --server-pubkey <BASE64> を指定して起動すること"
            )

        if not download_path:
            fallback_dir = os.path.expanduser("~/Downloads")
            download_path = (
                fallback_dir if os.path.isdir(fallback_dir) else os.path.abspath(".")
            )

        ret = (
            srv_key_str,
            session_arg,
            use_tmux,
            verbose,
            download_path,
            extra_args,
            allow_unpinned,
        )
    except Exception as e:
        raise RuntimeError(f"引数解析エラー: {e}")
    return ret


def request_if_due(
    req_topic: str, body: str, nonce: str, last_sent: float
) -> float:
    ret_sent = last_sent
    try:
        now = time.time()
        if now - last_sent >= REQUEST_RESEND_SECONDS:
            send_connect_request(req_topic, body)
            ret_sent = now
            print(
                f"\n[pinggy_ssh] 接続依頼を送信した (nonce={nonce})",
                file=sys.stderr,
            )
    except RuntimeError as e:
        print(f"\n[pinggy_ssh] {e}", file=sys.stderr)
    return ret_sent


def main() -> None:
    ret = None
    try:
        (
            srv_key_str,
            session_arg,
            use_tmux,
            verbose,
            download_path,
            extra_args,
            allow_unpinned,
        ) = parse_cli_args(sys.argv[1:])

        server_pub = parse_server_pubkey(srv_key_str)
        priv_key, pub_b64, topic = generate_keys()
        id_priv, id_b64 = generate_identity()
        req_topic = build_request_topic(srv_key_str)

        session_name = session_arg if session_arg else f"pg_{topic[:8]}"

        print("【公開鍵 QRコード】", file=sys.stderr)
        display_qr_code(pub_b64)
        print(f"\n【クライアント公開鍵 (Base64)】\n{pub_b64}\n", file=sys.stderr)
        print(f"[pinggy_ssh] 指紋(サーバーのy/Nで照合): {fingerprint(id_b64)}", file=sys.stderr)
        print(f"[pinggy_ssh] トピック     : {topic}", file=sys.stderr)
        print(f"[pinggy_ssh] セッション名 : {session_name}", file=sys.stderr)
        print(f"[pinggy_ssh] ダウンロード先 : {download_path}", file=sys.stderr)

        attempt = 0
        current_host = ""
        current_port = 0
        current_hostkey = ""
        nonce = ""
        req_body = ""
        last_sent = 0.0

        while True:
            attempt += 1

            if not current_host:
                if not nonce:
                    nonce = os.urandom(8).hex()
                    req_body = build_request_body(
                        srv_key_str, id_priv, id_b64, pub_b64, nonce
                    )
                    last_sent = 0.0
                last_sent = request_if_due(req_topic, req_body, nonce, last_sent)
                print(
                    f"[pinggy_ssh] サーバー応答待機中 (#{attempt})...",
                    end="\r",
                    file=sys.stderr,
                    flush=True,
                )
                try:
                    current_host, current_port, current_hostkey = fetch_ntfy_url(
                        priv_key, server_pub, topic, nonce, allow_unpinned
                    )
                    nonce = ""
                    print("", file=sys.stderr)
                except RuntimeError as e:
                    print(f"\n[pinggy_ssh] 待機中: {e}", file=sys.stderr)
                    time.sleep(RETRY_INTERVAL)
                    continue

            pin_state = "ホスト鍵ピン留めあり" if current_hostkey else "ホスト鍵未ピン留め"
            print(
                f"[pinggy_ssh] 接続先を取得: {current_host}:{current_port} ({pin_state})",
                file=sys.stderr,
            )

            t_start = time.time()
            exit_code = run_ssh(
                current_host,
                current_port,
                session_name,
                extra_args,
                download_path=download_path,
                use_tmux=use_tmux,
                verbose=verbose,
                hostkey=current_hostkey,
            )
            duration = time.time() - t_start

            print(
                f"[pinggy_ssh] SSH 終了 (code={exit_code}, 通信持続={int(duration)}s)",
                file=sys.stderr,
            )

            if exit_code == 130:
                print("[pinggy_ssh] ユーザー割り込み終了。", file=sys.stderr)
                break

            if duration < 5.0:
                print(
                    f"[pinggy_ssh] 接続先 ({current_host}:{current_port}) が即座に応答停止。新規接続依頼へ移行...",
                    file=sys.stderr,
                )
                current_host = ""
                current_port = 0
                current_hostkey = ""
            else:
                print(
                    f"[pinggy_ssh] 切断検出。現行URL ({current_host}:{current_port}) へ即時再試行...",
                    file=sys.stderr,
                )

            time.sleep(RETRY_INTERVAL)
    except KeyboardInterrupt:
        print("\n[pinggy_ssh] 割り込み終了", file=sys.stderr)
    except Exception as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)
    return ret


if __name__ == "__main__":
    main()
