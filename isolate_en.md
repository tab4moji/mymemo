# isolate — Network Isolation Sandbox for AI Agents and General Commands

## Overview
`isolate` is a network isolation sandbox for safely running AI agents and external commands by enforcing allowlist-based network access control with Linux network namespaces (`ip netns`) and `iptables`.

In addition to blocking unauthorized IP addresses and ports, `isolate` intercepts name resolution (DNS queries) using a built-in Trap / Proxy DNS server so that unauthorized connection attempts can be detected, blocked, and reported in real time along with both the target hostname and destination port.

---

## Key Features
- **Physical Network Isolation via Network Namespace**:
  - Creates an isolated network namespace (`ISOLATE`) connected through a `veth` pair (host side `iso_h`: `10.222.0.1/24`, guest side `iso_g`: `10.222.0.2/24`) using the `10.222.0.0/24` subnet.
  - Disables IPv6 on both `iso_h` and `iso_g` to prevent leaks over IPv6 paths.
- **Three-Path Allowlist Filtering with `iptables`**:
  - `nat` table `PREROUTING` (`ISOLATE_FLT_NAT`): Redirects DNS traffic and `DNAT`s host-bound traffic (`127.0.0.1` / host IPs → `10.222.0.1`).
  - `filter` table `FORWARD` (`ISOLATE_FLT`): `LOG`s (`[BLOCK] `) and `DROP`s unauthorized outbound traffic as well as all traffic to the dummy IP block (`198.18.0.0/15`).
  - `filter` table `INPUT` (`ISOLATE_FLT_IN`): `LOG`s (`[BLOCK] `) and `DROP`s unauthorized host-bound traffic, including local resolvers on WSL2 (such as `10.255.255.254`).
- **Built-in Trap / Proxy DNS Server (UDP & TCP)**:
  - Binds UDP and TCP sockets on ephemeral ports of `10.222.0.1`. Allowed hostnames are resolved on the host, dynamically permitted in `iptables`, and answered with real IPv4 addresses; disallowed hostnames are never forwarded upstream and instead receive dummy IPs so subsequent connection attempts reveal both hostname and port.
- **Real-Time Violation Detection, Termination, and Summary Report**:
  - Streams kernel logs via `sudo journalctl -k -f --since=now` for `[BLOCK]` entries and, in normal mode, immediately force-kills all processes in the namespace (including grandchild processes).
  - Prints a summary report to `stderr` on exit listing blocked targets and hit counts.
- **Full TTY State Preservation and Restoration**:
  - Saves and restores terminal attributes with `termios` and resets terminal UI modes via escape sequences so interactive/TUI applications do not leave the terminal corrupted even on forced termination.
- **Safe System Command Execution**:
  - Eliminates `os.system` entirely; all external system commands run through `run_sys_cmd` (`subprocess.run` with argument lists).

---

## Prerequisites
- Linux environment (WSL2 supported)
- Python 3
- `iproute2` (`ip netns`, `ip link`, `ip route`)
- `iptables`
- `systemd-journald` (`journalctl -k` access to kernel logs)
- `sudo` privileges

---

## Usage, Arguments, and Options

```bash
./isolate [-s] [--no-filter] '<targets_json>' <command...>
```

### Options
- `-h`, `--help`: Show help message and exit.
- `-s`, `--silent`: Silent mode. Does not terminate the child process on violations; continues execution while dropping unauthorized packets and prints the full summary report at exit.
- `--no-filter`: Sets up the isolated network namespace (`ISOLATE`) and `veth` pair only, without `iptables` filtering, the built-in DNS server, or `/etc/netns/ISOLATE` overrides.

### Positional Arguments
- `targets_json`: Allowed destinations as a JSON array string (use `'[]'` when no filter or no destinations are needed). Any combination of the following formats is supported:
  - `IP:PORT` (e.g. `"192.168.0.123:11434"`)
  - `IP` only (e.g. `"192.168.0.123"`)
  - `CIDR` / `CIDR:PORT` (e.g. `"192.168.0.0/24"`, `"192.168.0.0/24:443"`)
  - `hostname:PORT` / `hostname` (e.g. `"www.googleapis.com:443"`, `"daily-cloudcode-pa.googleapis.com:443"`)
  - **Contradiction Check**: If the list contains overlapping specs for the same hostname, IP, or CIDR range with conflicting port rules (e.g. both `192.168.0.11:11434` and `192.168.0.11`), `isolate` exits immediately with status `1`.
- `command...`: Command to execute inside the sandbox (`--` separator is supported).
  - If passed as a single quoted string containing spaces (e.g. `"ping 8.8.8.8"`), it is automatically split via `shlex.split`.

### Inherited and Automatically Set Environment Variables
Child commands are executed via `sudo ip netns exec ISOLATE sudo -u <user> env ...` with:
- `PATH`, `HOME`, `USER`: Preserved from the invoking environment.
- `OPENAI_BASE_URL`: Automatically set to `http://<primary_target>/v1`.
  - Defaults to `127.0.0.1:11434` if `targets_json` is empty.
  - Defaults port to `11434` when omitted from the first target.
  - Uses the network address if the first target is a CIDR range (e.g. `192.168.0.0/24` → `192.168.0.0`).
- `UV_OFFLINE=1`: Set automatically to enforce offline package resolution.

---

## DNS Interception and Hostname Control

### 1. Enforcing the Name Resolution Path Inside the Namespace
When filtering is enabled, `isolate` leverages `ip netns exec`'s automatic bind-mounting from `/etc/netns/ISOLATE/` without modifying the host's `/etc/resolv.conf` or `/etc/nsswitch.conf`:
- `/etc/netns/ISOLATE/resolv.conf`: Contains only `nameserver 10.222.0.1` (no `search` directive), avoiding loopback traps such as `127.0.0.53`.
- `/etc/netns/ISOLATE/nsswitch.conf`: Copies the host `/etc/nsswitch.conf` with the `hosts:` line rewritten to `hosts:          files dns`, preventing bypasses over `systemd-resolved` UNIX sockets.

Additionally, `ISOLATE_FLT_NAT` (`PREROUTING`) intercepts `10.222.0.1:53` (UDP/TCP) at the top of the chain and includes a catch-all redirect for any destination port `53` (UDP/TCP) at the bottom, ensuring direct queries to external or host resolvers (e.g., `dig @8.8.8.8`, `dig @10.255.255.254`) are also captured.

### 2. Behavior Matrix

| Access Type | DNS Handling & Internal Action | Result & Exit Report Format |
| :--- | :--- | :--- |
| **Exact-match allowed hostname** (to allowed port) | Resolved on the host via `socket.getaddrinfo(..., AF_INET)`. `allow_ip_target` dynamically adds NAT/FORWARD/INPUT `ACCEPT` rules for each resolved IPv4 and allowed port before returning up to 16 A records (fitting within 512 bytes). Non-`A` queries (`AAAA`, etc.) receive `NODATA` without triggering a violation. | Succeeds with no violation or report entry. |
| **Allowed hostname to a disallowed port** (e.g. `:80` when only `:443` is allowed) | DNS succeeds as an allowed hostname while recording the resolved IP → hostname mapping. The subsequent TCP connection to the unallowed port is blocked by `iptables`. | Blocked and reported as `<hostname>:<port>` (e.g. `www.googleapis.com:80`), without a `DNS:<hostname>` entry. |
| **Disallowed hostname** (including subdomains of allowed hostnames) | **Never queried upstream.** `A` queries receive a sequential dummy IP from RFC 2544 `198.18.0.0/16` (`198.18.0.1`, ...), `AAAA`/`HTTPS`/`SVCB` receive `NODATA`, and other record types (`TXT`, `MX`, `PTR`, etc.) receive `REFUSED`. `A`/`AAAA`/`HTTPS`/`SVCB` defer termination by `0.5`s to capture the follow-up connection port. | Any connection to the dummy IP hits the unconditional `198.18.0.0/15` `LOG`+`DROP` rule at the top of `ISOLATE_FLT`, blocking the attempt and recording both `<hostname>:<port>` (or `<hostname>:N/A` for ICMP) and `DNS:<hostname>`. DNS-only lookups with no follow-up connection are caught as `DNS:<hostname>` after `0.5`s or upon child exit. |
| **Direct IP connection** (disallowed IP or disallowed port on allowed IP) | Bypasses DNS and is dropped directly by `ISOLATE_FLT` (`FORWARD`) or `ISOLATE_FLT_IN` (`INPUT`). | Blocked and reported as `<IP>:<port>` (or `<IP>:N/A` for ICMP). |
| **With `--no-filter`** | Skips `/etc/netns/ISOLATE/` creation, built-in DNS, and `iptables` rules. | Full network access (uses host `/etc/resolv.conf`). |

---

## Examples and Report Output

### 1. Allow Only a Local LLM Server (Normal Mode)
```bash
./isolate '["192.168.0.123:11434"]' bash
```
If a process inside the sandbox attempts to access `https://google.com`:
```text
[!] Violation detected: blocked traffic to google.com:443. Terminating immediately.

=== Summary Report ===
  DNS:google.com (blocked: 2 times)
  google.com:443 (blocked: 1 time)
======================
```

### 2. Allow Specific External HTTPS Hosts
```bash
./isolate '["daily-cloudcode-pa.googleapis.com:443", "www.googleapis.com:443"]' curl -sS https://www.googleapis.com
```
- Access to `https://www.googleapis.com` (`:443`) succeeds with no violation.
- Accessing `http://www.googleapis.com` (`:80`) with the same allowlist is blocked and reports the hostname and port:
  ```text
  [!] Violation detected: blocked traffic to www.googleapis.com:80. Terminating immediately.

  === Summary Report ===
    www.googleapis.com:80 (blocked: 9 times)
  ======================
  ```
- Querying a subdomain (e.g. `leak.www.googleapis.com`) is treated as disallowed, returns a dummy IP (`198.18.0.1`), and is logged as `DNS:leak.www.googleapis.com` without leaking any DNS query upstream.

### 3. Inspect All Attempted Destinations in Silent Mode (`-s`)
```bash
./isolate -s '["192.168.0.123:11434"]' sh -c "curl -sS --max-time 2 https://google.com; curl -sS --max-time 2 http://google.com"
```
Execution continues without termination, and all blocked targets are summarized on exit:
```text
=== Summary Report ===
  DNS:google.com (blocked: 4 times)
  google.com:443 (blocked: 2 times)
  google.com:80 (blocked: 2 times)
======================
```

---

## TTY Restoration and Cleanup Design

### TTY Preservation and Recovery
1. **Save phase**: When `sys.stdin.isatty()` is true, `isolate` captures the original terminal attributes at startup via `termios.tcgetattr(sys.stdin.fileno())`.
2. **Restore phase**: Inside `cleanup()` (always executed on normal exit, violation termination, `SIGINT`, or `SIGTERM`):
   - Restores saved attributes via `termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, original_tty_attrs)` (falling back to `stty sane` if none were saved).
   - If `sys.stderr.isatty()` is true, writes terminal reset escape sequences to `stderr` (leaving `stdout` clean for pipelines):
     - `\x1b[?25h`: Show cursor
     - `\x1b[?1000l`, `\x1b[?1002l`, `\x1b[?1003l`, `\x1b[?1006l`: Disable mouse tracking modes
     - `\x1b[?1049l`: Exit alternate screen buffer
     - `\x1b[0m\n`: Reset text attributes and emit newline

### Cleanup Sequence
`cleanup()` (as well as pre-run cleanup at the start of `setup_network()`) tears down all temporary state cleanly:
1. Cancels any pending DNS deferral timer (`dns_violation_timer`) and closes the Trap / Proxy DNS sockets.
2. Runs `sudo pkill -9 -f "ip netns exec ISOLATE"` and `kill_netns_processes()` (`sudo ip netns pids ISOLATE` + `kill -9`) to terminate all descendant processes remaining inside the namespace.
3. Terminates the `journalctl` monitor subprocess.
4. Removes `ISOLATE_FLT_NAT`, `ISOLATE_FLT`, `ISOLATE_FLT_IN`, and their jump/masquerade rules from `PREROUTING`, `POSTROUTING`, `FORWARD`, and `INPUT`.
5. Deletes the `ISOLATE` network namespace, `iso_h` interface, and `/etc/netns/ISOLATE` directory.

---

## Notes and Limitations
- **No concurrent instances**: Fixed resource names (`ISOLATE`, `iso_h`/`iso_g`, `10.222.0.0/24`, `ISOLATE_FLT*`) mean multiple `./isolate` invocations cannot run concurrently on the same host.
- **Port-qualified rules match TCP only**: Specifying a port (e.g. `example.com:443`) restricts the `iptables` allow rule to TCP; omitting the port allows all protocols for that IP/CIDR.
- **Exact hostname matching**: Wildcards and automatic subdomain inheritance are not supported (allowing `www.googleapis.com` does not allow `sub.www.googleapis.com`).
- **IPv4 only**: IPv6 is disabled on the sandbox interfaces (`iso_h` and `iso_g`).
- **`/etc/hosts` entries**: Because `nsswitch.conf` uses `files dns`, local names defined in `/etc/hosts` (such as `localhost`) resolve locally without invoking the Trap DNS server.
