## ネットワークサンドボックス

### isolate

```python:isolate
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
目的: AIエージェントおよび汎用コマンド用ネットワーク隔離サンドボックス
機能:
  - Docker等のFORWARD DROP環境に対応した強固なルーティング制御
  - IPセグメントの衝突を回避するため 10.222.0.0/24 を採用
  - TTY制御およびICMP/TCP両対応のログ監視
  - クォートされた単一文字列コマンド("ping 8.8.8.8"など)の自動分割実行
更新履歴: 10 2026-06-26
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

    os.system(f"sudo ip link del {VETH_H} 2>/dev/null")
    os.system(f"sudo ip netns del {NS_NAME} 2>/dev/null")
    os.system(f"sudo iptables -t nat -D PREROUTING -i {VETH_H} -j {CHAIN_NAME}_NAT 2>/dev/null")
    os.system(f"sudo iptables -t nat -D POSTROUTING -s {GUEST_IP}/32 -j MASQUERADE 2>/dev/null")
    os.system(f"sudo iptables -D FORWARD -o {VETH_H} -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null")
    os.system(f"sudo iptables -D FORWARD -i {VETH_H} -j {CHAIN_NAME} 2>/dev/null")
    os.system(f"sudo iptables -F {CHAIN_NAME} 2>/dev/null")
    os.system(f"sudo iptables -X {CHAIN_NAME} 2>/dev/null")
    os.system(f"sudo iptables -t nat -F {CHAIN_NAME}_NAT 2>/dev/null")
    os.system(f"sudo iptables -t nat -X {CHAIN_NAME}_NAT 2>/dev/null")

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
            parts = target.split(":")
            ip = parts[0]
            port = parts[1] if len(parts) > 1 else None

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
            parts = target.split(":")
            ip = parts[0]
            if len(parts) > 1:
                port = parts[1]
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
        os.system(f"sudo pkill -9 -f 'ip netns exec {NS_NAME}' 2>/dev/null")
        if journal_proc is not None and journal_proc.poll() is None:
            journal_proc.terminate()
            journal_proc.wait(timeout=1)

        os.system(f"sudo iptables -t nat -D PREROUTING -i {VETH_H} -j {CHAIN_NAME}_NAT 2>/dev/null")
        os.system(f"sudo iptables -t nat -D POSTROUTING -s {GUEST_IP}/32 -j MASQUERADE 2>/dev/null")
        os.system(f"sudo iptables -D FORWARD -o {VETH_H} -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null")
        os.system(f"sudo iptables -D FORWARD -i {VETH_H} -j {CHAIN_NAME} 2>/dev/null")
        os.system(f"sudo iptables -F {CHAIN_NAME} 2>/dev/null")
        os.system(f"sudo iptables -X {CHAIN_NAME} 2>/dev/null")
        os.system(f"sudo iptables -t nat -F {CHAIN_NAME}_NAT 2>/dev/null")
        os.system(f"sudo iptables -t nat -X {CHAIN_NAME}_NAT 2>/dev/null")
        os.system(f"sudo ip netns del {NS_NAME} 2>/dev/null")
        os.system(f"sudo ip link del {VETH_H} 2>/dev/null")

        os.system("stty sane 2>/dev/null")
        os.system("reset 2>/dev/null")

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
    status = 0
    parser = argparse.ArgumentParser(description="AIエージェント隔離実行ツール")
    parser.add_argument('-s', '--silent', action='store_true', help='違反を継続')
    parser.add_argument('--no-filter', action='store_true', help='フィルタなし')
    parser.add_argument('targets_json', help='許可IP:PORT (例: \'["192.168.0.123:11434"]\')')
    parser.add_argument('command', nargs=argparse.REMAINDER, help='コマンド')

    args = parser.parse_args()
    if not args.command:
        print("[Error] コマンド未指定", file=sys.stderr)
        return 1

    try:
        targets = json.loads(args.targets_json)
    except json.JSONDecodeError:
        print("[Error] JSON解析失敗", file=sys.stderr)
        return 1

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        if not setup_network(targets, args.no_filter):
            return 1

        if not args.no_filter:
            threading.Thread(target=monitor_logs, args=(args.silent,), daemon=True).start()

        primary_target = targets[0] if targets else "127.0.0.1:11434"
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
    sys.exit(main())
```

### 使い方サンプル

```bash
pi@raspberrypi:~$
pi@raspberrypi:~$ isolate --silent '["192.168.0.123:11434"]' bash
pi@raspberrypi:~$ ping 8.8.8.8
PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.
^C
--- 8.8.8.8 ping statistics ---
6 packets transmitted, 0 received, 100% packet loss, time 5123ms

pi@raspberrypi:~$
exit

=== 終了レポート ===
  8.8.8.8:N/A (遮断: 6回)
==================

pi@raspberrypi:~$ isolate '["192.168.0.123:11434"]' bash
pi@raspberrypi:~$ ping 8.8.8.8
PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.

[!] 違反検知: 8.8.8.8:N/A への通信を遮断しました。直ちに終了します。

=== 終了レポート ===
  8.8.8.8:N/A (遮断: 1回)
==================

pi@raspberrypi:~$
```
