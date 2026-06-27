## 隔離ツール「isolate」

### サンドボックス用プログラム

ネットワーク的に閉じ込めるためのサンプル

```python:isolate
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
目的: AIエージェントおよび汎用コマンド用ネットワーク隔離サンドボックス
機能:
  - IPセグメントの衝突を回避するため 10.222.0.0/24 を採用
  - TTY制御およびICMP/TCP両対応のログ監視
  - クォートされた単一文字列コマンド("ping 8.8.8.8"など)の自動分割実行
更新履歴: 10 2026-06-26 / 11 2026-06-27 TTY設定の完全保存・復元機能の追加 / 12 2026-06-27 エスケープシーケンスによる端末状態復帰（カーソル表示・マウス追跡無効化等）の追加 / 13 2026-06-27 端末復元出力をstderrに変更、文字色リセットと改行を追加 / 14 2026-06-27 os.systemを完全に排除し、run_sys_cmdに統一 / 15 2026-06-27 許可リストにIPアドレスのみ（ポート省略）が指定された場合のデフォルトポート（11434）補完処理を追加
"""

import sys
import os
import json
import subprocess
import argparse
import threading
import time
import re
import signal
import shlex
import termios
import ipaddress

NS_NAME = "ISOLATE"
VETH_H = "iso_h"
VETH_G = "iso_g"
CHAIN_NAME = "ISOLATE_FLT"
GUEST_IP = "10.222.0.2"
HOST_IP = "10.222.0.1"

block_counts = {}
journal_proc = None
child_proc = None
cleanup_done = False
violation_event = threading.Event()
original_tty_attrs = None

def parse_target(target_str):
    # Strip brackets for IPv6 if present
    if target_str.startswith("["):
        close_idx = target_str.find("]")
        if close_idx != -1:
            ip_part = target_str[1:close_idx]
            port_part = target_str[close_idx+1:]
            if port_part.startswith(":"):
                return ip_part, port_part[1:]
            else:
                return ip_part, None

    # If the whole string is a valid IP address/network, it has no port
    try:
        ipaddress.ip_network(target_str, strict=False)
        return target_str, None
    except ValueError:
        pass

    if ":" in target_str:
        parts = target_str.rsplit(":", 1)
        if parts[1].isdigit():
            return parts[0], parts[1]
            
    return target_str, None

def format_target(host, port):
    if ":" in host and not host.startswith("["):
        host_str = f"[{host}]"
    else:
        host_str = host
    if port:
        return f"{host_str}:{port}"
    return host_str

def check_targets_contradiction(targets):
    parsed = []
    for t in targets:
        host_or_subnet, port = parse_target(t)
        net = None
        try:
            net = ipaddress.ip_network(host_or_subnet, strict=False)
        except ValueError:
            pass
        parsed.append({
            'raw': t,
            'host_or_subnet': host_or_subnet,
            'port': port,
            'network': net
        })

    for i in range(len(parsed)):
        for j in range(i + 1, len(parsed)):
            t1 = parsed[i]
            t2 = parsed[j]
            
            overlap = False
            if t1['network'] is not None and t2['network'] is not None:
                if t1['network'].version == t2['network'].version:
                    n1 = t1['network']
                    n2 = t2['network']
                    if (n1.network_address in n2 and n1.broadcast_address in n2) or \
                       (n2.network_address in n1 and n2.broadcast_address in n1):
                        overlap = True
            else:
                if t1['host_or_subnet'].lower() == t2['host_or_subnet'].lower():
                    overlap = True
            
            if overlap:
                if t1['port'] != t2['port']:
                    return True, t1['raw'], t2['raw']
                    
    return False, None, None

def run_sys_cmd(cmd_list, ignore_error=False):
    status = True
    try:
        subprocess.run(
            cmd_list,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=not ignore_error
        )
    except subprocess.CalledProcessError:
        if not ignore_error:
            print(f"[Error] コマンド実行失敗: {' '.join(cmd_list)}", file=sys.stderr)
        status = False
    return status

def get_host_ips():
    ips = ["127.0.0.1", "localhost"]
    try:
        res = subprocess.run(["hostname", "-I"], capture_output=True, text=True, check=True)
        ips.extend(res.stdout.strip().split())
    except Exception:
        pass
    return ips

def setup_network(targets, no_filter):
    status = True
    host_ips = get_host_ips()

    run_sys_cmd(["sudo", "ip", "link", "del", VETH_H], ignore_error=True)
    run_sys_cmd(["sudo", "ip", "netns", "del", NS_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "PREROUTING", "-i", VETH_H, "-j", f"{CHAIN_NAME}_NAT"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "POSTROUTING", "-s", f"{GUEST_IP}/32", "-j", "MASQUERADE"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-o", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-i", VETH_H, "-j", CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-F", CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-X", CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-F", f"{CHAIN_NAME}_NAT"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-X", f"{CHAIN_NAME}_NAT"], ignore_error=True)

    commands = [
        ["sudo", "ip", "netns", "add", NS_NAME],
        ["sudo", "ip", "link", "add", VETH_H, "type", "veth", "peer", "name", VETH_G],
        ["sudo", "ip", "link", "set", VETH_G, "netns", NS_NAME],
        ["sudo", "ip", "netns", "exec", NS_NAME, "ip", "addr", "add", f"{GUEST_IP}/24", "dev", VETH_G],
        ["sudo", "ip", "netns", "exec", NS_NAME, "ip", "link", "set", VETH_G, "up"],
        ["sudo", "ip", "netns", "exec", NS_NAME, "ip", "link", "set", "lo", "up"],
        ["sudo", "ip", "addr", "add", f"{HOST_IP}/24", "dev", VETH_H],
        ["sudo", "ip", "link", "set", VETH_H, "up"],
        ["sudo", "ip", "netns", "exec", NS_NAME, "ip", "route", "add", "default", "via", HOST_IP],
        ["sudo", "sysctl", "-w", "net.ipv4.ip_forward=1"]
    ]

    for cmd in commands:
        if not run_sys_cmd(cmd):
            status = False
            break

    if status and not no_filter:
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-N", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", "PREROUTING", "1", "-i", VETH_H, "-j", f"{CHAIN_NAME}_NAT"])

        for target in targets:
            ip, port = parse_target(target)

            if ip in host_ips:
                if port:
                    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-p", "tcp", "-d", ip, "--dport", port, "-j", "DNAT", "--to-destination", f"{HOST_IP}:{port}"])
                else:
                    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-d", ip, "-j", "DNAT", "--to-destination", HOST_IP])
            else:
                if port:
                    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-p", "tcp", "-d", ip, "--dport", port, "-j", "ACCEPT"])
                else:
                    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-d", ip, "-j", "ACCEPT"])

        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", "POSTROUTING", "1", "-s", f"{GUEST_IP}/32", "-j", "MASQUERADE"])
        run_sys_cmd(["sudo", "iptables", "-I", "FORWARD", "1", "-o", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"])
        
        run_sys_cmd(["sudo", "iptables", "-N", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-I", "FORWARD", "1", "-i", VETH_H, "-j", CHAIN_NAME])

        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-i", VETH_H, "-d", HOST_IP, "-j", "ACCEPT"])
        
        for target in targets:
            ip, port = parse_target(target)
            if port:
                run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-i", VETH_H, "-p", "tcp", "--dport", port, "-d", ip, "-j", "ACCEPT"])
            else:
                run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-i", VETH_H, "-d", ip, "-j", "ACCEPT"])

        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-j", "LOG", "--log-prefix", "[BLOCK] ", "--log-level", "4"])
        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-j", "DROP"])

    return status

def monitor_logs(silent_mode):
    global journal_proc
    status = True
    cmd = ["sudo", "journalctl", "-k", "-f", "--since=now"]
    try:
        journal_proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
        )
    except Exception as e:
        print(f"[Error] ログ監視の起動に失敗: {e}", file=sys.stderr)
        status = False

    if status:
        ip_pattern = re.compile(r'DST=([^ ]+)')
        port_pattern = re.compile(r'DPT=([^ ]+)')
        while True:
            line = journal_proc.stdout.readline()
            if not line:
                break
            if "[BLOCK]" in line:
                ip_match = ip_pattern.search(line)
                if ip_match:
                    dst_ip = ip_match.group(1)
                    port_match = port_pattern.search(line)
                    dst_port = port_match.group(1) if port_match else "N/A"
                    target = f"{dst_ip}:{dst_port}"
                    block_counts[target] = block_counts.get(target, 0) + 1
                    if not silent_mode and not violation_event.is_set():
                        print(f"\n[!] 違反検知: {target} への通信を遮断しました。直ちに終了します。", file=sys.stderr)
                        violation_event.set()
    return status

def cleanup():
    global cleanup_done
    status = True
    if not cleanup_done:
        cleanup_done = True
        run_sys_cmd(["sudo", "pkill", "-9", "-f", f"ip netns exec {NS_NAME}"], ignore_error=True)
        if journal_proc is not None and journal_proc.poll() is None:
            journal_proc.terminate()
            journal_proc.wait(timeout=1)

        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "PREROUTING", "-i", VETH_H, "-j", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "POSTROUTING", "-s", f"{GUEST_IP}/32", "-j", "MASQUERADE"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-o", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-i", VETH_H, "-j", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-F", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-X", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-F", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-X", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "ip", "netns", "del", NS_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "ip", "link", "del", VETH_H], ignore_error=True)

        if original_tty_attrs is not None:
            try:
                termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, original_tty_attrs)
            except Exception:
                pass
        else:
            run_sys_cmd(["stty", "sane"], ignore_error=True)

        # 端末制御エスケープシーケンスの復元（カーソル表示、マウス追跡無効化、代替バッファ終了、文字色リセット、改行）
        if sys.stderr.isatty():
            try:
                sys.stderr.write("\x1b[?25h\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1049l\x1b[0m\n")
                sys.stderr.flush()
            except Exception:
                pass

        if block_counts:
            print("\n=== 終了レポート ===", file=sys.stderr)
            for target, count in sorted(block_counts.items(), key=lambda x: x[1], reverse=True):
                print(f"  {target} (遮断: {count}回)", file=sys.stderr)
            print("==================\n", file=sys.stderr)
    return status

def signal_handler(sig, frame):
    cleanup()
    sys.exit(1)
    return None

def main():
    """
    Type: function
    Scope: global
    Created: 2026-06-27T08:59:45+09:00
    Last Updated: 2026-06-27T09:00:00+09:00
    Status: ACTIVE
    """
    global original_tty_attrs
    if sys.stdin.isatty():
        try:
            original_tty_attrs = termios.tcgetattr(sys.stdin.fileno())
        except Exception:
            pass

    status = 0
    parser = argparse.ArgumentParser(description="AIエージェント隔離実行ツール")
    parser.add_argument('-s', '--silent', action='store_true', help='違反を継続')
    parser.add_argument('--no-filter', action='store_true', help='フィルタなし')
    parser.add_argument('targets_json', help='許可IP:PORT、IPのみ、またはCIDRサブネット (例: \'["192.168.0.123:11434"]\', \'["192.168.0.123"]\', \'["192.168.0.0/24"]\')')
    parser.add_argument('command', nargs=argparse.REMAINDER, help='コマンド')

    if len(sys.argv) == 1:
        parser.print_help()
        return 0

    args = parser.parse_args()
    if not args.command:
        print("[Error] コマンド未指定", file=sys.stderr)
        return 1

    try:
        targets = json.loads(args.targets_json)
    except json.JSONDecodeError:
        print("[Error] JSON解析失敗", file=sys.stderr)
        return 1

    is_contradictory, t1, t2 = check_targets_contradiction(targets)
    if is_contradictory:
        print(f"[Error] ターゲット指定に矛盾があります: {t1} と {t2}", file=sys.stderr)
        return 1

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        if not setup_network(targets, args.no_filter):
            return 1

        if not args.no_filter:
            threading.Thread(target=monitor_logs, args=(args.silent,), daemon=True).start()

        primary_target = targets[0] if targets else "127.0.0.1:11434"
        pt_host, pt_port = parse_target(primary_target)
        if pt_port is None:
            pt_port = "11434"
        if "/" in pt_host:
            try:
                net = ipaddress.ip_network(pt_host, strict=False)
                pt_host = str(net.network_address)
            except ValueError:
                pass
        primary_target = format_target(pt_host, pt_port)
        exec_env = os.environ.copy()
        exec_user = os.environ.get("SUDO_USER", os.environ.get("USER", "root"))

        cmd_runner = ["sudo", "ip", "netns", "exec", NS_NAME, "sudo", "-u", exec_user, "env"]
        cmd_runner.append(f"PATH={exec_env.get('PATH', '')}")
        cmd_runner.append(f"HOME={exec_env.get('HOME', f'/home/{exec_user}')}")
        cmd_runner.append(f"USER={exec_user}")
        cmd_runner.extend([f"OPENAI_BASE_URL=http://{primary_target}/v1", "UV_OFFLINE=1"])

        real_cmd = args.command[1:] if args.command[0] == '--' else args.command
        
        # コマンドが1つの文字列("ping 8.8.8.8"など)として渡された場合の対策
        if len(real_cmd) == 1 and ' ' in real_cmd[0]:
            real_cmd = shlex.split(real_cmd[0])

        cmd_runner.extend(real_cmd)

        global child_proc
        child_proc = subprocess.Popen(cmd_runner, env=exec_env)

        while child_proc.poll() is None:
            if violation_event.is_set():
                break
            time.sleep(0.1)
    finally:
        cleanup()

    return status

if __name__ == '__main__':
    sys.exit(main())```

### 使い方サンプル

このツールは、指定したIPアドレスとポート以外へのネットワーク通信をすべて遮断する「隔離環境（サンドボックス）」の中で、任意のコマンドやAIエージェントを安全に実行するためのプログラムだ。
Linuxの `ip netns` (ネットワーク名前空間) と `iptables` を組み合わせて仮想ネットワークを構築し、ホワイトリスト方式で通信を制御する。許可されていない外部への通信（情報漏洩や不正アクセスなど）が発生するとパケットを破棄し、デフォルトでは即座にプロセスを強制終了させて安全を担保する。

#### 1. 基本的な使い方
実行したいコマンドの前に、許可する通信先（IPとポート）をJSON配列形式で指定して実行する。

```bash
# 基本構文
isolate [オプション] '["許可IP:ポート", ...]' 実行するコマンド

# 例: ローカルのLLMサーバー (192.168.0.123:11434) との通信だけを許可してbashを起動
isolate '["192.168.0.123:11434"]' bash
```

#### 2. オプション機能
用途に合わせて挙動を変更できる。

- **`-s` または `--silent`**
  不正な通信を検知しても、プログラムを強制終了させない。パケットの破棄（遮断）だけを行い、実行中のプロセスはそのまま継続させる。
- **`--no-filter`**
  フィルタリングルールを適用せず、隔離された仮想ネットワーク環境の構築だけを行う（通信制限なし）。

#### 3. 具体的な動作と仕様
- **ネットワーク構造**
  既存のネットワークとの競合を避けるため、内部で `10.222.0.0/24` の仮想セグメントを使用する。
- **違反検知とレポート**
  不正な通信（ICMPのpingやTCP接続など）はカーネルログ経由でリアルタイム監視される。プログラム終了時には「どのIPに何回不正アクセスしようとしたか」がレポートとして表示される。
- **自動環境変数セット**
  隔離環境内でも現在のユーザーの `PATH` や `HOME` を引き継ぐ。さらに、AIツール向けに `OPENAI_BASE_URL` （許可IPのリスト先頭をベースにしたURL）と `UV_OFFLINE=1` が自動で設定されるため、LLM呼び出し等がスムーズに行える。

### 4. 実行例と挙動の違い
**通常モード（違反検知で即終了）**
外部（例: `8.8.8.8`）へ通信しようとすると、パケットが遮断された瞬間に隔離環境ごと強制終了する。
```bash
$ isolate '["192.168.0.123:11434"]' bash
$ ping 8.8.8.8
[!] 違反検知: 8.8.8.8:N/A への通信を遮断しました。直ちに終了します。
=== 終了レポート ===
  8.8.8.8:N/A (遮断: 1回)
==================
```

**サイレントモード（`-s` 指定）**
外部へ通信しようとしても強制終了はせず、パケットだけが捨てられ続ける。自分で終了（`exit` 等）した際にレポートが出る。
```bash
$ isolate -s '["192.168.0.123:11434"]' bash
$ ping 8.8.8.8
# (通信は失敗し続けるが終了しない)
^C
$ exit
=== 終了レポート ===
  8.8.8.8:N/A (遮断: 6回)
==================
```

##
