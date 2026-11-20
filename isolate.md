## 隔離ツール「isolate」

### サンドボックス用プログラム

ネットワーク的に閉じ込めるためのサンプル
※pwsh 版では ICMP を防ぐことはできない。

#### help

```bash
$ isolate
usage: isolate [-h] [-s] [--no-filter] targets_json ...

AIエージェント隔離実行ツール

positional arguments:
  targets_json  許可IP:PORT、IPのみ、またはCIDRサブネット (例: '["192.168.0.123:11434"]',
                '["192.168.0.123"]', '["192.168.0.0/24"]')
  command       コマンド

options:
  -h, --help    show this help message and exit
  -s, --silent  違反を継続
  --no-filter   フィルタなし
```

#### python コード

```python:isolate
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Purpose: Network isolation sandbox for AI agents and general commands
Features:
  - Uses 10.222.0.0/24 to avoid IP segment conflicts
  - Full TTY preservation/restoration and kernel log monitoring (ICMP/TCP/UDP)
  - Automatic splitting for single quoted command strings (e.g. "ping 8.8.8.8")
Changelog: 10 2026-06-26 / 11 2026-06-27 Added full TTY save/restore / 12 2026-06-27 Added terminal escape-sequence restoration (cursor/mouse/alt-screen) / 13 2026-06-27 Switched terminal restore output to stderr with color reset and newline / 14 2026-06-27 Replaced all os.system calls with run_sys_cmd / 15 2026-06-27 Added default port (11434) completion when port is omitted / 16 2026-11-20 Added Trap DNS server and INPUT chain filtering to intercept name resolution / 17 2026-11-20 Added dummy IP responses (198.18.0.0/16) and hostname+port correlation in logs / 18 2026-11-20 Added upstream resolution proxy and dynamic iptables rules for allowed hostnames / 19 2026-11-20 Translated all internal comments, help text, and messages to English
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
import socket

NS_NAME = "ISOLATE"
VETH_H = "iso_h"
VETH_G = "iso_g"
CHAIN_NAME = "ISOLATE_FLT"
INPUT_CHAIN_NAME = f"{CHAIN_NAME}_IN"
NETNS_ETC_DIR = f"/etc/netns/{NS_NAME}"
GUEST_IP = "10.222.0.2"
HOST_IP = "10.222.0.1"
FAKE_DNS_BLOCK_CIDR = "198.18.0.0/15"
FAKE_DNS_DEFER_SEC = 0.5
FAKE_DNS_NODATA_QTYPES = {"AAAA", "HTTPS", "SVCB"}
DNS_QTYPE_MAP = {
    1: "A",
    2: "NS",
    5: "CNAME",
    6: "SOA",
    12: "PTR",
    15: "MX",
    16: "TXT",
    28: "AAAA",
    33: "SRV",
    64: "SVCB",
    65: "HTTPS",
    255: "ANY",
}

block_counts = {}
journal_proc = None
child_proc = None
cleanup_done = False
violation_event = threading.Event()
violation_lock = threading.Lock()
iptables_lock = threading.Lock()
dns_udp_sock = None
dns_tcp_sock = None
dns_stop_event = threading.Event()
fake_ip_by_host = {}
host_by_fake_ip = {}
allowed_host_ports = {}
resolved_host_by_ip = {}
dynamic_allowed_rules = set()
cached_host_ips = []
fake_ip_counter = 1
dns_violation_timer = None
pending_dns_violation = None
journal_ready_event = threading.Event()
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

def run_sys_cmd(cmd_list, ignore_error=False, input_text=None):
    status = True
    try:
        subprocess.run(
            cmd_list,
            input=input_text,
            text=input_text is not None,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=not ignore_error
        )
    except subprocess.CalledProcessError:
        if not ignore_error:
            print(f"[Error] Command execution failed: {' '.join(cmd_list)}", file=sys.stderr)
        status = False
    return status

def is_ip_or_network(value):
    try:
        ipaddress.ip_network(value, strict=False)
        return True
    except ValueError:
        return False

def _cancel_dns_violation_timer_locked():
    global dns_violation_timer, pending_dns_violation
    if dns_violation_timer is not None:
        dns_violation_timer.cancel()
        dns_violation_timer = None
    pending_dns_violation = None

def reset_dns_tracking():
    global fake_ip_counter
    with violation_lock:
        _cancel_dns_violation_timer_locked()
        fake_ip_by_host.clear()
        host_by_fake_ip.clear()
        allowed_host_ports.clear()
        resolved_host_by_ip.clear()
        fake_ip_counter = 1
    with iptables_lock:
        dynamic_allowed_rules.clear()
        cached_host_ips.clear()

def get_or_alloc_fake_ip(qname):
    """Return a deterministic fake IPv4 address in 198.18.0.0/16 for qname."""
    global fake_ip_counter
    key = qname.lower()
    with violation_lock:
        existing = fake_ip_by_host.get(key)
        if existing is not None:
            return existing
        ip = f"198.18.{(fake_ip_counter >> 8) & 0xFF}.{fake_ip_counter & 0xFF}"
        fake_ip_counter = 1 if fake_ip_counter >= 65534 else fake_ip_counter + 1
        old_host = host_by_fake_ip.get(ip)
        if old_host is not None and old_host != key:
            fake_ip_by_host.pop(old_host, None)
        fake_ip_by_host[key] = ip
        host_by_fake_ip[ip] = key
        return ip

def register_resolved_host_ips(ips, hostname):
    norm_host = hostname.rstrip(".").lower()
    with violation_lock:
        for ip in ips:
            resolved_host_by_ip[ip] = norm_host

def lookup_fake_ip_host(ip_str):
    with violation_lock:
        return host_by_fake_ip.get(ip_str)

def lookup_ip_host(ip_str):
    with violation_lock:
        return host_by_fake_ip.get(ip_str) or resolved_host_by_ip.get(ip_str)

def _fire_pending_dns_violation():
    global dns_violation_timer, pending_dns_violation
    with violation_lock:
        desc = pending_dns_violation
        pending_dns_violation = None
        dns_violation_timer = None
        if desc is not None and not violation_event.is_set():
            print(f"\n[!] Violation detected: blocked {desc}. Terminating immediately.", file=sys.stderr)
            violation_event.set()

def flush_pending_dns_violation(silent_mode):
    with violation_lock:
        desc = pending_dns_violation
        _cancel_dns_violation_timer_locked()
        if not silent_mode and not violation_event.is_set() and desc is not None:
            print(f"\n[!] Violation detected: blocked {desc}.", file=sys.stderr)
            violation_event.set()

def record_violation(target, silent_mode, detail=None, defer_sec=0.0):
    global dns_violation_timer, pending_dns_violation
    with violation_lock:
        block_counts[target] = block_counts.get(target, 0) + 1
        if not silent_mode and not violation_event.is_set():
            desc = detail if detail else f"traffic to {target}"
            if defer_sec <= 0:
                _cancel_dns_violation_timer_locked()
                print(f"\n[!] Violation detected: blocked {desc}. Terminating immediately.", file=sys.stderr)
                violation_event.set()
            elif pending_dns_violation is None:
                pending_dns_violation = desc
                dns_violation_timer = threading.Timer(defer_sec, _fire_pending_dns_violation)
                dns_violation_timer.daemon = True
                dns_violation_timer.start()

def parse_dns_query(data):
    """Parse DNS query name, qtype string, and question end offset per RFC 1035."""
    if not isinstance(data, (bytes, bytearray)) or len(data) < 12:
        return None, None, None

    qdcount = int.from_bytes(data[4:6], "big")
    if qdcount < 1:
        return None, None, None

    labels = []
    pos = 12
    qname_end = None
    jumps = 0
    seen_offsets = set()
    terminated = False

    while pos < len(data):
        length = data[pos]
        if length == 0:
            if qname_end is None:
                qname_end = pos + 1
            terminated = True
            break
        if (length & 0xC0) == 0xC0:
            if pos + 1 >= len(data):
                return None, None, None
            if qname_end is None:
                qname_end = pos + 2
            ptr = ((length & 0x3F) << 8) | data[pos + 1]
            if ptr >= len(data) or ptr in seen_offsets or jumps >= 16:
                return None, None, None
            seen_offsets.add(ptr)
            jumps += 1
            pos = ptr
        elif (length & 0xC0) != 0:
            return None, None, None
        else:
            pos += 1
            if pos + length > len(data):
                return None, None, None
            labels.append(data[pos:pos + length].decode("ascii", errors="replace"))
            pos += length

    if not terminated or qname_end is None or qname_end + 4 > len(data):
        return None, None, None

    qtype = int.from_bytes(data[qname_end:qname_end + 2], "big")
    q_end = qname_end + 4
    qname = ".".join(labels).lower() if labels else "."
    qtype_str = DNS_QTYPE_MAP.get(qtype, f"TYPE{qtype}")
    return qname, qtype_str, q_end

def _build_dns_header(data, rcode, qdcount, ancount=0, ra=False):
    txid = data[0:2]
    req_flags = int.from_bytes(data[2:4], "big")
    resp_flags = (req_flags & 0x7900) | 0x8000 | (0x0080 if ra else 0) | (rcode & 0x0F)
    return (
        txid
        + resp_flags.to_bytes(2, "big")
        + qdcount.to_bytes(2, "big")
        + ancount.to_bytes(2, "big")
        + b"\x00\x00\x00\x00"
    )

def encode_dns_name(qname):
    """Encode a domain name into RFC 1035 wire-format labels."""
    if not qname or qname == ".":
        return b"\x00"
    out = bytearray()
    for label in qname.strip(".").split("."):
        if not label:
            continue
        label_bytes = label.encode("ascii", errors="replace")[:63]
        out.append(len(label_bytes))
        out.extend(label_bytes)
    out.append(0)
    return bytes(out)

def _has_dns_pointer(qname_bytes):
    pos = 0
    while pos < len(qname_bytes):
        length = qname_bytes[pos]
        if length == 0:
            return False
        if (length & 0xC0) == 0xC0:
            return True
        pos += 1 + length
    return False

def _build_dns_empty_answer_response(data, q_end, rcode, ra=True):
    if not isinstance(data, (bytes, bytearray)) or len(data) < 12:
        return None
    if q_end is not None and 12 < q_end <= len(data):
        return _build_dns_header(data, rcode=rcode, qdcount=1, ancount=0, ra=ra) + bytes(data[12:q_end])
    return _build_dns_header(data, rcode=rcode, qdcount=0, ancount=0, ra=ra)

def build_dns_a_records_response(data, q_end, qname, ips, ttl=60):
    """Build a DNS NOERROR A response containing up to 16 IPv4 RRs fitting within 512 bytes."""
    if not isinstance(data, (bytes, bytearray)) or len(data) < 12 or q_end is None or q_end <= 12 or q_end > len(data):
        return None
    if not ips:
        return build_dns_nodata_response(data, q_end)

    question = bytes(data[12:q_end])
    qname_wire = data[12:max(12, q_end - 4)]
    rr_name = encode_dns_name(qname) if _has_dns_pointer(qname_wire) else b"\xc0\x0c"
    ttl_bytes = ttl.to_bytes(4, "big")
    answers = bytearray()
    ancount = 0

    for ip_str in ips[:16]:
        try:
            ip_bytes = socket.inet_aton(ip_str)
        except OSError:
            continue
        rr = rr_name + b"\x00\x01\x00\x01" + ttl_bytes + b"\x00\x04" + ip_bytes
        if ancount > 0 and 12 + len(question) + len(answers) + len(rr) > 512:
            break
        answers.extend(rr)
        ancount += 1

    if ancount == 0:
        return build_dns_nodata_response(data, q_end)

    header = _build_dns_header(data, rcode=0, qdcount=1, ancount=ancount, ra=True)
    return header + question + bytes(answers)

def build_dns_a_response(data, q_end, qname, fake_ip):
    """Build a DNS NOERROR A response containing a single fake IPv4 RR."""
    return build_dns_a_records_response(data, q_end, qname, [fake_ip])

def build_dns_nodata_response(data, q_end):
    """Build a DNS NOERROR empty-answer (NODATA) response for AAAA/HTTPS/SVCB."""
    if not isinstance(data, (bytes, bytearray)) or len(data) < 12 or q_end is None or q_end <= 12 or q_end > len(data):
        return None
    return _build_dns_empty_answer_response(data, q_end, rcode=0, ra=True)

def build_dns_error_response(data, q_end, rcode):
    """Build a DNS error response (e.g. NXDOMAIN=3, SERVFAIL=2)."""
    return _build_dns_empty_answer_response(data, q_end, rcode=rcode, ra=True)

def build_dns_refused_response(data, q_end):
    """Build a DNS REFUSED (RCODE=5) response preserving TXID, Opcode, RD, and question."""
    return _build_dns_empty_answer_response(data, q_end, rcode=5, ra=False)

def resolve_host_ipv4(hostname):
    """Resolve hostname to deduplicated IPv4 addresses via the host resolver."""
    try:
        infos = socket.getaddrinfo(hostname, None, socket.AF_INET, socket.SOCK_STREAM)
    except socket.gaierror as e:
        return [], e.errno
    except Exception:
        return [], None
    ips = []
    seen = set()
    for info in infos:
        ip = info[4][0]
        if ip not in seen:
            seen.add(ip)
            ips.append(ip)
    return ips, None

def _is_in_fake_dns_range(ip_or_cidr):
    try:
        net = ipaddress.ip_network(ip_or_cidr, strict=False)
        fake_net = ipaddress.ip_network(FAKE_DNS_BLOCK_CIDR, strict=False)
        return net.version == 4 and net.overlaps(fake_net) and net.prefixlen >= fake_net.prefixlen
    except ValueError:
        return False

def allow_ip_target(ip_or_cidr, port):
    """Insert NAT, FORWARD, and INPUT allow rules for ip_or_cidr[:port] safely and idempotently."""
    if _is_in_fake_dns_range(ip_or_cidr):
        return False

    key = (ip_or_cidr, port)
    with iptables_lock:
        if key in dynamic_allowed_rules:
            return True

        # NAT PREROUTING: insert at 3 (after HOST_IP:53 DNAT rules, before catch-all *:53 rules).
        if ip_or_cidr in cached_host_ips:
            if port:
                run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", f"{CHAIN_NAME}_NAT", "3", "-p", "tcp", "-d", ip_or_cidr, "--dport", port, "-j", "DNAT", "--to-destination", f"{HOST_IP}:{port}"])
            else:
                run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", f"{CHAIN_NAME}_NAT", "3", "-d", ip_or_cidr, "-j", "DNAT", "--to-destination", HOST_IP])
        else:
            if port:
                run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", f"{CHAIN_NAME}_NAT", "3", "-p", "tcp", "-d", ip_or_cidr, "--dport", port, "-j", "ACCEPT"])
            else:
                run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", f"{CHAIN_NAME}_NAT", "3", "-d", ip_or_cidr, "-j", "ACCEPT"])

        # FORWARD chain: insert at 4 (after HOST_IP ACCEPT + FAKE_DNS_BLOCK_CIDR LOG/DROP, before tail LOG/DROP).
        if port:
            run_sys_cmd(["sudo", "iptables", "-I", CHAIN_NAME, "4", "-i", VETH_H, "-p", "tcp", "--dport", port, "-d", ip_or_cidr, "-j", "ACCEPT"])
        else:
            run_sys_cmd(["sudo", "iptables", "-I", CHAIN_NAME, "4", "-i", VETH_H, "-d", ip_or_cidr, "-j", "ACCEPT"])

        # INPUT chain: insert at 4 (after ESTABLISHED,RELATED + Trap DNS UDP/TCP, before tail LOG/DROP).
        dst_ip = HOST_IP if ip_or_cidr in cached_host_ips else ip_or_cidr
        if port:
            run_sys_cmd(["sudo", "iptables", "-I", INPUT_CHAIN_NAME, "4", "-i", VETH_H, "-p", "tcp", "--dport", port, "-d", dst_ip, "-j", "ACCEPT"])
        else:
            run_sys_cmd(["sudo", "iptables", "-I", INPUT_CHAIN_NAME, "4", "-i", VETH_H, "-d", dst_ip, "-j", "ACCEPT"])

        dynamic_allowed_rules.add(key)
        return True

def handle_dns_payload(data, silent_mode):
    qname, qtype_str, q_end = parse_dns_query(data)
    if qname is not None:
        if qname in allowed_host_ports:
            if qtype_str == "A":
                ips, err = resolve_host_ipv4(qname)
                if not ips and err is not None:
                    rcode = 3 if err == socket.EAI_NONAME else 2
                    return build_dns_error_response(data, q_end, rcode)
                if not ips:
                    return build_dns_nodata_response(data, q_end)
                allowed_port = allowed_host_ports[qname]
                register_resolved_host_ips(ips, qname)
                for ip in ips:
                    allow_ip_target(ip, allowed_port)
                return build_dns_a_records_response(data, q_end, qname, ips)
            return build_dns_nodata_response(data, q_end)

        if qtype_str == "A":
            fake_ip = get_or_alloc_fake_ip(qname)
            # Defer termination briefly so an immediate connection attempt reveals destination port.
            record_violation(
                f"DNS:{qname}",
                silent_mode,
                detail=f"DNS lookup ({qname} [A])",
                defer_sec=FAKE_DNS_DEFER_SEC,
            )
            return build_dns_a_response(data, q_end, qname, fake_ip)
        if qtype_str in FAKE_DNS_NODATA_QTYPES:
            record_violation(
                f"DNS:{qname}",
                silent_mode,
                detail=f"DNS lookup ({qname} [{qtype_str}])",
                defer_sec=FAKE_DNS_DEFER_SEC,
            )
            return build_dns_nodata_response(data, q_end)

    display_name = qname if qname else "<unknown>"
    display_type = qtype_str if qtype_str else "UNKNOWN"
    # Record violation before sending REFUSED so fast-exiting children cannot race ahead of reporting.
    record_violation(
        f"DNS:{display_name}",
        silent_mode,
        detail=f"DNS lookup ({display_name} [{display_type}])",
    )
    return build_dns_refused_response(data, q_end)

def close_dns_trap_sockets():
    global dns_udp_sock, dns_tcp_sock
    dns_stop_event.set()
    for sock in (dns_udp_sock, dns_tcp_sock):
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass
    dns_udp_sock = None
    dns_tcp_sock = None

def bind_dns_trap_sockets():
    global dns_udp_sock, dns_tcp_sock
    close_dns_trap_sockets()
    dns_stop_event.clear()
    udp_sock = None
    tcp_sock = None
    try:
        udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_sock.bind((HOST_IP, 0))
        udp_sock.settimeout(0.5)
        udp_port = udp_sock.getsockname()[1]

        tcp_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        tcp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        tcp_sock.bind((HOST_IP, 0))
        tcp_sock.listen(16)
        tcp_sock.settimeout(0.5)
        tcp_port = tcp_sock.getsockname()[1]

        dns_udp_sock = udp_sock
        dns_tcp_sock = tcp_sock
        return udp_port, tcp_port
    except Exception as e:
        print(f"[Error] Failed to bind DNS trap sockets: {e}", file=sys.stderr)
        for sock in (udp_sock, tcp_sock):
            if sock is not None:
                try:
                    sock.close()
                except Exception:
                    pass
        return None, None

def _handle_dns_udp_packet(sock, data, addr, silent_mode):
    resp = handle_dns_payload(data, silent_mode)
    if resp is not None and not dns_stop_event.is_set():
        try:
            sock.sendto(resp, addr)
        except OSError:
            pass

def run_dns_udp_server(silent_mode):
    sock = dns_udp_sock
    if sock is None:
        return
    while not dns_stop_event.is_set():
        try:
            data, addr = sock.recvfrom(4096)
        except socket.timeout:
            continue
        except OSError:
            break
        threading.Thread(
            target=_handle_dns_udp_packet, args=(sock, data, addr, silent_mode), daemon=True
        ).start()

def _recv_exact(conn, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            return None
        buf.extend(chunk)
    return bytes(buf)

def _handle_dns_tcp_client(conn, silent_mode):
    try:
        conn.settimeout(2.0)
        length_bytes = _recv_exact(conn, 2)
        if not length_bytes:
            return
        msg_len = int.from_bytes(length_bytes, "big")
        if msg_len == 0 or msg_len > 65535:
            return
        payload = _recv_exact(conn, msg_len)
        if payload is None:
            return
        resp = handle_dns_payload(payload, silent_mode)
        if resp is not None:
            conn.sendall(len(resp).to_bytes(2, "big") + resp)
    except (socket.timeout, OSError):
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass

def run_dns_tcp_server(silent_mode):
    sock = dns_tcp_sock
    if sock is None:
        return
    while not dns_stop_event.is_set():
        try:
            conn, _ = sock.accept()
        except socket.timeout:
            continue
        except OSError:
            break
        threading.Thread(
            target=_handle_dns_tcp_client, args=(conn, silent_mode), daemon=True
        ).start()

def setup_netns_dns_files():
    """Write per-netns resolv.conf and nsswitch.conf for ip netns exec bind-mounting."""
    if not run_sys_cmd(["sudo", "mkdir", "-p", NETNS_ETC_DIR]):
        return False

    resolv_path = f"{NETNS_ETC_DIR}/resolv.conf"
    if not run_sys_cmd(["sudo", "tee", resolv_path], input_text=f"nameserver {HOST_IP}\n"):
        return False
    if not run_sys_cmd(["sudo", "chmod", "644", resolv_path]):
        return False

    nsswitch_src = "/etc/nsswitch.conf"
    if os.path.exists(nsswitch_src):
        try:
            with open(nsswitch_src, "r", encoding="utf-8") as f:
                lines = f.readlines()
            new_lines = []
            replaced = False
            for line in lines:
                if re.match(r"^\s*hosts\s*:", line):
                    new_lines.append("hosts:          files dns\n")
                    replaced = True
                else:
                    new_lines.append(line)
            if not replaced:
                new_lines.append("hosts:          files dns\n")
            nsswitch_path = f"{NETNS_ETC_DIR}/nsswitch.conf"
            if not run_sys_cmd(["sudo", "tee", nsswitch_path], input_text="".join(new_lines)):
                return False
            if not run_sys_cmd(["sudo", "chmod", "644", nsswitch_path]):
                return False
        except Exception as e:
            print(f"[Error] Failed to generate nsswitch.conf: {e}", file=sys.stderr)
            return False

    return True

def get_host_ips():
    ips = ["127.0.0.1", "localhost"]
    try:
        res = subprocess.run(["hostname", "-I"], capture_output=True, text=True, check=True)
        ips.extend(res.stdout.strip().split())
    except Exception:
        pass
    return ips

def kill_netns_processes():
    """Force-kill any process still running inside the isolated network namespace."""
    try:
        res = subprocess.run(
            ["sudo", "ip", "netns", "pids", NS_NAME],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0 and res.stdout:
            self_pid = str(os.getpid())
            pids = [p for p in res.stdout.split() if p.isdigit() and p != self_pid]
            if pids:
                run_sys_cmd(["sudo", "kill", "-9", *pids], ignore_error=True)
    except Exception:
        pass

def setup_network(targets, no_filter):
    status = True
    host_ips = get_host_ips()

    close_dns_trap_sockets()
    reset_dns_tracking()
    dns_stop_event.clear()

    run_sys_cmd(["sudo", "ip", "link", "del", VETH_H], ignore_error=True)
    kill_netns_processes()
    run_sys_cmd(["sudo", "ip", "netns", "del", NS_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "rm", "-rf", NETNS_ETC_DIR], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "PREROUTING", "-i", VETH_H, "-j", f"{CHAIN_NAME}_NAT"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "POSTROUTING", "-s", f"{GUEST_IP}/32", "-j", "MASQUERADE"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-o", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-i", VETH_H, "-j", CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-D", "INPUT", "-i", VETH_H, "-j", INPUT_CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-F", CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-X", CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-F", INPUT_CHAIN_NAME], ignore_error=True)
    run_sys_cmd(["sudo", "iptables", "-X", INPUT_CHAIN_NAME], ignore_error=True)
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

    if status:
        run_sys_cmd(["sudo", "sysctl", "-w", f"net.ipv6.conf.{VETH_H}.disable_ipv6=1"], ignore_error=True)
        run_sys_cmd(["sudo", "ip", "netns", "exec", NS_NAME, "sysctl", "-w", f"net.ipv6.conf.{VETH_G}.disable_ipv6=1"], ignore_error=True)

    if status and not no_filter:
        udp_port, tcp_port = bind_dns_trap_sockets()
        if udp_port is None or tcp_port is None:
            return False

        if not setup_netns_dns_files():
            close_dns_trap_sockets()
            return False

        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-N", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", "PREROUTING", "1", "-i", VETH_H, "-j", f"{CHAIN_NAME}_NAT"])

        # Intercept system DNS (HOST_IP:53) first even if targets include broad CIDRs (e.g. 10.0.0.0/8).
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-d", HOST_IP, "-p", "udp", "--dport", "53", "-j", "DNAT", "--to-destination", f"{HOST_IP}:{udp_port}"])
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-d", HOST_IP, "-p", "tcp", "--dport", "53", "-j", "DNAT", "--to-destination", f"{HOST_IP}:{tcp_port}"])
        # Catch-all redirect for direct DNS queries to external or host DNS servers (e.g. 8.8.8.8, 10.255.255.254).
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-p", "udp", "--dport", "53", "-j", "DNAT", "--to-destination", f"{HOST_IP}:{udp_port}"])
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-A", f"{CHAIN_NAME}_NAT", "-p", "tcp", "--dport", "53", "-j", "DNAT", "--to-destination", f"{HOST_IP}:{tcp_port}"])

        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-I", "POSTROUTING", "1", "-s", f"{GUEST_IP}/32", "-j", "MASQUERADE"])
        run_sys_cmd(["sudo", "iptables", "-I", "FORWARD", "1", "-o", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"])
        
        run_sys_cmd(["sudo", "iptables", "-N", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-I", "FORWARD", "1", "-i", VETH_H, "-j", CHAIN_NAME])
        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-i", VETH_H, "-d", HOST_IP, "-j", "ACCEPT"])
        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-i", VETH_H, "-d", FAKE_DNS_BLOCK_CIDR, "-j", "LOG", "--log-prefix", "[BLOCK] ", "--log-level", "4"])
        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-i", VETH_H, "-d", FAKE_DNS_BLOCK_CIDR, "-j", "DROP"])
        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-j", "LOG", "--log-prefix", "[BLOCK] ", "--log-level", "4"])
        run_sys_cmd(["sudo", "iptables", "-A", CHAIN_NAME, "-j", "DROP"])

        run_sys_cmd(["sudo", "iptables", "-N", INPUT_CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-I", "INPUT", "1", "-i", VETH_H, "-j", INPUT_CHAIN_NAME])
        run_sys_cmd(["sudo", "iptables", "-A", INPUT_CHAIN_NAME, "-i", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"])
        run_sys_cmd(["sudo", "iptables", "-A", INPUT_CHAIN_NAME, "-i", VETH_H, "-p", "udp", "-d", HOST_IP, "--dport", str(udp_port), "-j", "ACCEPT"])
        run_sys_cmd(["sudo", "iptables", "-A", INPUT_CHAIN_NAME, "-i", VETH_H, "-p", "tcp", "-d", HOST_IP, "--dport", str(tcp_port), "-j", "ACCEPT"])
        run_sys_cmd(["sudo", "iptables", "-A", INPUT_CHAIN_NAME, "-j", "LOG", "--log-prefix", "[BLOCK] ", "--log-level", "4"])
        run_sys_cmd(["sudo", "iptables", "-A", INPUT_CHAIN_NAME, "-j", "DROP"])

        with iptables_lock:
            cached_host_ips[:] = list(host_ips)

        for target in targets:
            host_or_ip, port = parse_target(target)
            if is_ip_or_network(host_or_ip):
                allow_ip_target(host_or_ip, port)
            else:
                norm_host = host_or_ip.rstrip(".").lower()
                with violation_lock:
                    allowed_host_ports[norm_host] = port
                if norm_host in host_ips:
                    allow_ip_target("127.0.0.1", port)
                ips, _ = resolve_host_ipv4(norm_host)
                if ips:
                    register_resolved_host_ips(ips, norm_host)
                    for ip in ips:
                        allow_ip_target(ip, port)

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
        print(f"[Error] Failed to start log monitor: {e}", file=sys.stderr)
        status = False
    finally:
        journal_ready_event.set()

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
                    mapped_host = lookup_ip_host(dst_ip)
                    dst_label = mapped_host if mapped_host else dst_ip
                    target = f"{dst_label}:{dst_port}"
                    record_violation(target, silent_mode)
    return status

def cleanup():
    global cleanup_done
    status = True
    if not cleanup_done:
        cleanup_done = True
        with violation_lock:
            _cancel_dns_violation_timer_locked()
        close_dns_trap_sockets()
        run_sys_cmd(["sudo", "pkill", "-9", "-f", f"ip netns exec {NS_NAME}"], ignore_error=True)
        kill_netns_processes()
        if journal_proc is not None and journal_proc.poll() is None:
            journal_proc.terminate()
            journal_proc.wait(timeout=1)

        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "PREROUTING", "-i", VETH_H, "-j", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-D", "POSTROUTING", "-s", f"{GUEST_IP}/32", "-j", "MASQUERADE"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-o", VETH_H, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-D", "FORWARD", "-i", VETH_H, "-j", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-D", "INPUT", "-i", VETH_H, "-j", INPUT_CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-F", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-X", CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-F", INPUT_CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-X", INPUT_CHAIN_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-F", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "iptables", "-t", "nat", "-X", f"{CHAIN_NAME}_NAT"], ignore_error=True)
        run_sys_cmd(["sudo", "ip", "netns", "del", NS_NAME], ignore_error=True)
        run_sys_cmd(["sudo", "ip", "link", "del", VETH_H], ignore_error=True)
        run_sys_cmd(["sudo", "rm", "-rf", NETNS_ETC_DIR], ignore_error=True)

        if original_tty_attrs is not None:
            try:
                termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, original_tty_attrs)
            except Exception:
                pass
        else:
            run_sys_cmd(["stty", "sane"], ignore_error=True)

        # Restore terminal modes via escape sequences (show cursor, disable mouse tracking, exit alt buffer, reset colors, newline)
        if sys.stderr.isatty():
            try:
                sys.stderr.write("\x1b[?25h\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1049l\x1b[0m\n")
                sys.stderr.flush()
            except Exception:
                pass

        if block_counts:
            print("\n=== Summary Report ===", file=sys.stderr)
            for target, count in sorted(block_counts.items(), key=lambda x: x[1], reverse=True):
                unit = "time" if count == 1 else "times"
                print(f"  {target} (blocked: {count} {unit})", file=sys.stderr)
            print("======================\n", file=sys.stderr)
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
    parser = argparse.ArgumentParser(description="Network isolation sandbox for AI agents and general commands")
    parser.add_argument('-s', '--silent', action='store_true', help='Continue execution on violations without terminating')
    parser.add_argument('--no-filter', action='store_true', help='Disable network filtering and DNS interception')
    parser.add_argument('targets_json', help='Allowed targets as JSON array: IP:PORT, IP, CIDR, CIDR:PORT, or hostname[:PORT] (e.g. \'["192.168.0.123:11434"]\', \'["192.168.0.0/24"]\', \'["www.googleapis.com:443"]\')')
    parser.add_argument('command', nargs=argparse.REMAINDER, help='Command to run inside the sandbox')

    if len(sys.argv) == 1:
        parser.print_help()
        return 0

    args = parser.parse_args()
    if not args.command:
        print("[Error] No command specified", file=sys.stderr)
        return 1

    try:
        targets = json.loads(args.targets_json)
    except json.JSONDecodeError:
        print("[Error] Failed to parse targets_json as JSON", file=sys.stderr)
        return 1

    is_contradictory, t1, t2 = check_targets_contradiction(targets)
    if is_contradictory:
        print(f"[Error] Contradictory target specifications: {t1} and {t2}", file=sys.stderr)
        return 1

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        if not setup_network(targets, args.no_filter):
            return 1

        if not args.no_filter:
            journal_ready_event.clear()
            threading.Thread(target=monitor_logs, args=(args.silent,), daemon=True).start()
            journal_ready_event.wait(timeout=0.5)
            if dns_udp_sock is not None:
                threading.Thread(target=run_dns_udp_server, args=(args.silent,), daemon=True).start()
            if dns_tcp_sock is not None:
                threading.Thread(target=run_dns_tcp_server, args=(args.silent,), daemon=True).start()

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
        
        # Split a single quoted command string (e.g. "ping 8.8.8.8") into argv tokens
        if len(real_cmd) == 1 and ' ' in real_cmd[0]:
            real_cmd = shlex.split(real_cmd[0])

        cmd_runner.extend(real_cmd)

        global child_proc
        child_proc = subprocess.Popen(cmd_runner, env=exec_env)

        while child_proc.poll() is None:
            if violation_event.is_set():
                break
            time.sleep(0.1)
        flush_pending_dns_violation(args.silent)
    finally:
        cleanup()

    return status

if __name__ == '__main__':
    sys.exit(main())
```

#### Powershell7(pwsh) コード

※pwsh 版では ICMP を防ぐことはできない。

```powershell:isolate.ps1
<#
.SYNOPSIS
    Windows版 isolate (PowerShellラッパー)
    ※管理者権限で実行してください。
.EXAMPLE
    .\isolate.ps1 -Program "notepad.exe" -AllowedIP "192.168.0.123" -AllowedPort 11434 -CommandArgs @("memo.txt")
    .\isolate.ps1 -Program "node.exe" -AllowedIP "192.168.0.123" -AllowedPort 11434 -CommandArgs @("-e", "...")
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$Program,

    [Parameter(Mandatory=$true)]
    [string]$AllowedIP,

    [Parameter(Mandatory=$false)]
    [int]$AllowedPort = 0,

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$CommandArgs
)

# 実行ファイルのフルパス解決
$resolvedProgram = (Get-Command $Program -ErrorAction Stop).Source

# Windows 11 ストア版メモ帳などの AppX エイリアス実体を解決
if ($resolvedProgram -like "*\System32\notepad.exe" -or $resolvedProgram -like "*\SysWOW64\notepad.exe") {
    $uwpNotepad = Get-ChildItem -Path "$env:ProgramFiles\WindowsApps" -Filter "Notepad.exe" -Recurse -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName
    if ($uwpNotepad) {
        $resolvedProgram = $uwpNotepad
    }
}

$rulePrefix = "IsolateRule_$([Guid]::NewGuid().ToString('N').Substring(0, 8))"

Write-Host "[isolate] 対象プログラム: $resolvedProgram" -ForegroundColor Cyan
Write-Host "[isolate] 許可ターゲット: ${AllowedIP}:$AllowedPort" -ForegroundColor Cyan

function Get-IPRangeBeforeAndAfter([string]$ipStr) {
    $ip = [System.Net.IPAddress]::Parse($ipStr)
    $bytes = $ip.GetAddressBytes()
    [Array]::Reverse($bytes)
    $num = [System.BitConverter]::ToUInt32($bytes, 0)

    $ranges = [System.Collections.Generic.List[string]]::new()

    if ($num -gt 1) {
        $prevBytes = [System.BitConverter]::GetBytes([uint32]($num - 1))
        [Array]::Reverse($prevBytes)
        $prevIp = [System.Net.IPAddress]::new($prevBytes).ToString()
        $ranges.Add("0.0.0.1-$prevIp")
    }

    if ($num -lt [uint32]4294967294) {
        $nextBytes = [System.BitConverter]::GetBytes([uint32]($num + 1))
        [Array]::Reverse($nextBytes)
        $nextIp = [System.Net.IPAddress]::new($nextBytes).ToString()
        $ranges.Add("$nextIp-255.255.255.254")
    }

    return $ranges
}

$blockRanges = Get-IPRangeBeforeAndAfter -ipStr $AllowedIP

try {
    # 1. 許可IP以外のIPv4アドレスへの送信を遮断
    $i = 0
    foreach ($range in $blockRanges) {
        New-NetFirewallRule -DisplayName "${rulePrefix}_Block_IP_${i}" `
            -Direction Outbound `
            -Program $resolvedProgram `
            -RemoteAddress $range `
            -Action Block `
            -Profile Any `
            -ErrorAction Stop | Out-Null
        $i++
    }

    # 2. IPv6遮断
    New-NetFirewallRule -DisplayName "${rulePrefix}_Block_IPv6" `
        -Direction Outbound `
        -Program $resolvedProgram `
        -RemoteAddress "::/0" `
        -Action Block `
        -Profile Any `
        -ErrorAction SilentlyContinue | Out-Null

    # 3. ポート制限
    if ($AllowedPort -gt 0) {
        if ($AllowedPort -gt 1) {
            New-NetFirewallRule -DisplayName "${rulePrefix}_Block_PortBefore" `
                -Direction Outbound `
                -Program $resolvedProgram `
                -RemoteAddress $AllowedIP `
                -RemotePort "1-$($AllowedPort - 1)" `
                -Protocol TCP `
                -Action Block `
                -Profile Any | Out-Null
        }
        if ($AllowedPort -lt 65535) {
            New-NetFirewallRule -DisplayName "${rulePrefix}_Block_PortAfter" `
                -Direction Outbound `
                -Program $resolvedProgram `
                -RemoteAddress $AllowedIP `
                -RemotePort "$($AllowedPort + 1)-65535" `
                -Protocol TCP `
                -Action Block `
                -Profile Any | Out-Null
        }
    }

    Write-Host "[isolate] 隔離ファイアウォールルールを適用しました。プロセスを起動します..." -ForegroundColor Green

    # GUI/CUI問わずプロセスが閉じるまで待機
    $proc = Start-Process -FilePath $resolvedProgram -ArgumentList $CommandArgs -PassThru -NoNewWindow
    $proc.WaitForExit()

} finally {
    Write-Host "`n[isolate] プロセスが終了しました。ファイアウォールルールを削除しています..." -ForegroundColor Yellow
    Get-NetFirewallRule -DisplayName "${rulePrefix}*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Host "[isolate] クリーンアップ完了" -ForegroundColor Green
}
```

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

```pwershell
.\isolate.ps1 -Program "curl.exe" -AllowedIP "192.168.0.123" -AllowedPort 11434 -CommandArgs @("-m","5","-sS","-I","http://1.1.1.1")
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
※pwsh 版では ICMP を防ぐことはできない。
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
