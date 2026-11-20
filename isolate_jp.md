# isolate (AIエージェント・汎用コマンド用ネットワーク隔離実行ツール) 仕様書

## 概要
`isolate` は、AIエージェントや外部コマンドを安全に実行するため、Linux のネットワーク名前空間（`ip netns`）と `iptables` を用いて通信先をホワイトリスト制御するネットワーク隔離サンドボックスである。

許可されていない IP アドレス・ポートへの通信だけでなく、ホスト名による名前解決（DNS クエリ）も内蔵の Trap / Proxy DNS サーバで捕捉し、未許可ドメインへの接続試行はホスト名および宛先ポート付きでリアルタイム検知・遮断・記録する。

---

## 主な機能
- **ネットワーク名前空間による物理的隔離**:
  - 名前空間 `ISOLATE` と `veth` ペア（ホスト側 `iso_h`: `10.222.0.1/24`、ゲスト側 `iso_g`: `10.222.0.2/24`）を構築し、`10.222.0.0/24` セグメントで通信を分離する。
  - IPv6 経路からの漏洩を防ぐため、`iso_h` および `iso_g` インターフェースの IPv6 を無効化する。
- **`iptables` による 3 経路ホワイトリスト制御**:
  - `nat` テーブル `PREROUTING`（`ISOLATE_FLT_NAT`）: DNS リダイレクト、およびホスト宛通信の `DNAT`（`127.0.0.1` / ホスト IP → `10.222.0.1`）。
  - `filter` テーブル `FORWARD`（`ISOLATE_FLT`）: 許可リスト以外の外部通信およびダミー IP 帯域（`198.18.0.0/15`）の `LOG`（`[BLOCK] `）＋ `DROP`。
  - `filter` テーブル `INPUT`（`ISOLATE_FLT_IN`）: WSL2 のローカル DNS（`10.255.255.254` 等）を含むホスト自身への未許可通信も確実に `LOG`（`[BLOCK] `）＋ `DROP`。
- **内蔵 Trap / Proxy DNS サーバ（UDP / TCP 両対応）**:
  - `10.222.0.1` のエフェメラルポートに UDP / TCP ソケットをバインドし、許可ホスト名のみホスト側で名前解決して動的許可・実 IP 返却を行い、未許可ホスト名は外部へ一切問い合わせずダミー IP 応答により後続接続のホスト名＋ポートを特定する。
- **リアルタイム違反検知・強制終了・終了レポート**:
  - `sudo journalctl -k -f --since=now` でカーネルの `[BLOCK]` ログをリアルタイム監視し、通常モードでは違反検知時に名前空間内の全プロセス（孫プロセス含む）を即座に強制終了する。
  - 終了時に遮断された宛先・回数を集計した終了レポートを `stderr` に出力する。
- **TTY 状態の完全保存・復元**:
  - `termios` と端末制御エスケープシーケンスにより、TUI ツールの強制終了時でも端末状態を元の状態へ復旧する。
- **安全な外部コマンド実行**:
  - `os.system` を一切使用せず、すべてのシステムコマンド呼び出しをリスト引数ベースの `run_sys_cmd`（`subprocess.run`）に統一している。

---

## 動作前提
- Linux 環境（WSL2 環境に対応）
- Python 3
- `iproute2`（`ip netns`、`ip link`、`ip route`）
- `iptables`
- `systemd-journald`（`journalctl -k` でカーネルログを参照できること）
- `sudo` 実行権限

---

## 構文と引数・オプション

```bash
./isolate [-s] [--no-filter] '<targets_json>' <command...>
```

### オプション
- `-h`, `--help`: ヘルプを表示して終了する。
- `-s`, `--silent`: サイレントモード。違反を検知しても子プロセスを強制終了せず、パケット遮断と記録のみを行って実行を継続する（終了時にまとめて終了レポートを出力する）。
- `--no-filter`: ネットワーク隔離空間（`ISOLATE` netns と `veth` ペア）のみを構築し、`iptables` フィルタリング、内蔵 DNS サーバ、`/etc/netns/ISOLATE` による名前解決の上書きを行わない。

### 位置引数
- `targets_json`: 許可する接続先を JSON 配列文字列で指定する。以下を混在して指定可能（フィルタ不要時は `'[]'` を指定）。
  - `IP:PORT`（例: `"192.168.0.123:11434"`）
  - `IP` のみ（例: `"192.168.0.123"`）
  - `CIDR` / `CIDR:PORT`（例: `"192.168.0.0/24"`, `"192.168.0.0/24:443"`）
  - `ホスト名:PORT` / `ホスト名`（例: `"www.googleapis.com:443"`, `"daily-cloudcode-pa.googleapis.com:443"`）
  - **ターゲット矛盾チェック**: 同一のホスト名、IP、または重複する CIDR サブネット範囲に対して、ポート指定の有無や異なるポート指定が混在している場合は起動時にエラーを出力し、終了コード `1` で終了する。
- `command...`: 隔離環境内で実行するコマンド（先頭に `--` を置くことも可能）。
  - 単一のクォート済み文字列（例: `"ping 8.8.8.8"`）が渡された場合は `shlex.split` で自動分割して実行する。

### 自動引き継ぎ・設定される環境変数
子プロセスは `sudo ip netns exec ISOLATE sudo -u <実行ユーザー> env ...` 経由で実行され、以下の環境変数が設定される。
- `PATH`, `HOME`, `USER`: 呼び出し元環境から引き継ぐ。
- `OPENAI_BASE_URL`: `http://<先頭ターゲット>/v1` を自動設定する。
  - `targets_json` が空の場合は `127.0.0.1:11434` を使用。
  - ポート省略時はデフォルトポート `11434` を補完。
  - 先頭ターゲットが CIDR 表記の場合はネットワークアドレス（例: `192.168.0.0/24` → `192.168.0.0`）を割り当てる。
- `UV_OFFLINE=1`: オフラインモードを有効化する。

---

## 名前解決（DNS）捕捉とホスト名制御の仕組み

### 1. 隔離空間内の名前解決経路の強制統一
フィルタ有効時（`--no-filter` 未指定時）、`ip netns exec ISOLATE` が `/etc/netns/ISOLATE/` 配下を自動バインドマウントする仕組みを利用し、以下の設定ファイルを一時生成する（ホスト側の `/etc/resolv.conf` や `/etc/nsswitch.conf` は変更しない）。
- `/etc/netns/ISOLATE/resolv.conf`: `nameserver 10.222.0.1` のみを記述（`search` 行なし）。`127.0.0.53` 等へのローカルループバック回避を防ぐ。
- `/etc/netns/ISOLATE/nsswitch.conf`: ホストの `/etc/nsswitch.conf` をベースに `hosts:` 行を `hosts:          files dns` に書き換え、`systemd-resolved` の UNIX ソケット等によるバイパスを防ぐ。

さらに `ISOLATE_FLT_NAT`（`PREROUTING`）の先頭で `10.222.0.1:53`（UDP/TCP）を、末尾で任意の宛先ポート `53`（UDP/TCP）をそれぞれ内蔵 Trap / Proxy DNS サーバのエフェメラルポートへ `DNAT` する。これにより、`dig @8.8.8.8` や `dig @10.255.255.254` のようにネームサーバを直打ちするプロセスも確実に捕捉される。

### 2. ケース別の挙動

| アクセス種別 | DNS 応答と内部処理 | 通信可否・終了レポート表記 |
| :--- | :--- | :--- |
| **`targets_json` に完全一致する許可ホスト名**（許可ポートへのアクセス） | ホスト側で `socket.getaddrinfo(..., AF_INET)` により実 IPv4 を解決し、各 IP の許可ポートを `allow_ip_target` で `ISOLATE_FLT_NAT` / `ISOLATE_FLT` / `ISOLATE_FLT_IN` に動的追加してから実 IPv4 リスト（最大 16 件・512 バイト以内）を返却する（`AAAA` 等の非 `A` クエリには違反なしで `NODATA` を返却）。 | 違反検知なしで正常通信できる。 |
| **許可ホスト名の未許可ポート**（例: `:443` のみ許可時に `:80` へ接続） | 名前解決自体は許可ホストとして正常処理しつつ、解決された実 IP → ホスト名の対応を記憶する。後続の未許可ポート接続が `iptables` で遮断される。 | 遮断され、`<ホスト名>:<ポート>`（例: `www.googleapis.com:80`）として記録・通知される（`DNS:<ホスト名>` は記録されない）。 |
| **未許可ホスト名**（許可ホストのサブドメイン含む） | **外部 DNS には一切問い合わせない。** `A` クエリにはダミー IP（RFC 2544 `198.18.0.0/16` から `198.18.0.1` 以降を順次割当）、`AAAA`/`HTTPS`/`SVCB` には `NODATA`、その他（`TXT`/`MX`/`PTR` 等）には `REFUSED` を返す。`A`/`AAAA`/`HTTPS`/`SVCB` は後続接続の宛先ポートを特定するため `0.5` 秒の猶予タイマーを設定する。 | ダミー IP への接続は `ISOLATE_FLT` 先頭の `198.18.0.0/15` 無条件 `LOG`＋`DROP` ルールで必ず遮断され、`<ホスト名>:<ポート>`（例: `google.com:443`、ICMP 等は `google.com:N/A`）と `DNS:<ホスト名>` の両方が記録される。接続が起きない DNS 問い合わせのみの場合も、猶予経過後または子プロセス終了時に `DNS:<ホスト名>` として検知・記録される。 |
| **IP 直打ち接続**（未許可 IP または許可 IP の未許可ポート） | DNS を経由せず `ISOLATE_FLT`（`FORWARD`）または `ISOLATE_FLT_IN`（`INPUT`）で遮断される。 | `<IP>:<ポート>`（ICMP 等は `<IP>:N/A`）として検知・記録される。 |
| **`--no-filter` 指定時** | `/etc/netns/ISOLATE/` の生成・内蔵 DNS 起動・`iptables` ルール追加を行わない。 | 制限なしで通信可能（ホストの `/etc/resolv.conf` を参照）。 |

---

## 実行例と終了レポート例

### 1. ローカル LLM のみ許可する（通常モード）
```bash
./isolate '["192.168.0.123:11434"]' bash
```
- 隔離環境内から未許可の `https://google.com` へ接続を試みた場合:
  ```text
  [!] Violation detected: blocked traffic to google.com:443. Terminating immediately.

  === Summary Report ===
    DNS:google.com (blocked: 2 times)
    google.com:443 (blocked: 1 time)
  ======================
  ```

### 2. 特定の外部 HTTPS ホストのみ許可する
```bash
./isolate '["daily-cloudcode-pa.googleapis.com:443", "www.googleapis.com:443"]' curl -sS https://www.googleapis.com
```
- 許可したホストの `:443` への通信は違反にならず正常に完了する。
- 同じ許可リストで `http://www.googleapis.com`（`:80`）へ接続しようとした場合:
  ```text
  [!] Violation detected: blocked traffic to www.googleapis.com:80. Terminating immediately.

  === Summary Report ===
    www.googleapis.com:80 (blocked: 9 times)
  ======================
  ```
- 許可ホストのサブドメイン（例: `leak.www.googleapis.com`）へ名前解決を試みた場合も外部 DNS には漏れず、ダミー IP（`198.18.0.1` 等）が返され `DNS:leak.www.googleapis.com` として捕捉・遮断される。

### 3. サイレントモード（`-s`）で通信先を調査する
```bash
./isolate -s '["192.168.0.123:11434"]' sh -c "curl -sS --max-time 2 https://google.com; curl -sS --max-time 2 http://google.com"
```
強制終了せずに実行を継続し、終了時に遮断された全ターゲットを回数順に表示する:
```text
=== Summary Report ===
  DNS:google.com (blocked: 4 times)
  google.com:443 (blocked: 2 times)
  google.com:80 (blocked: 2 times)
======================
```

---

## TTY 復元とクリーンアップ設計

### TTY 状態保存と復元
1. **保存フェーズ**: `sys.stdin.isatty()` が真の場合、起動時に `termios.tcgetattr(sys.stdin.fileno())` で元の端末属性を取得・保持する。
2. **復元フェーズ**: `cleanup()` 実行時（正常終了、違反検知による強制終了、`SIGINT`/`SIGTERM` 受信時のいずれでも `finally` / シグナルハンドラ経由で必ず実行）に以下を行う。
   - 保存した端末属性があれば `termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, original_tty_attrs)` で復旧（未取得時は `stty sane` にフォールバック）。
   - `sys.stderr.isatty()` が真の場合、標準出力を汚さずに以下のエスケープシーケンスを `stderr` へ送信する。
     - `\x1b[?25h`: カーソル表示の復帰
     - `\x1b[?1000l`, `\x1b[?1002l`, `\x1b[?1003l`, `\x1b[?1006l`: 各種マウス追跡モードの無効化
     - `\x1b[?1049l`: 代替画面バッファの終了
     - `\x1b[0m\n`: 文字装飾リセットと改行

### 終了時クリーンアップ手順
`cleanup()`（および `setup_network()` 開始時の事前清掃）では以下を順に実行し、ホスト環境にゴミを残さない。
1. DNS 遅延タイマー（`dns_violation_timer`）のキャンセルと Trap / Proxy DNS ソケットのクローズ。
2. `sudo pkill -9 -f "ip netns exec ISOLATE"` に加え、`sudo ip netns pids ISOLATE` で名前空間内に残存する孫プロセスまで取得して `SIGKILL` で強制終了（`kill_netns_processes()`）。
3. `journalctl` 子プロセスの終了。
4. `ISOLATE_FLT_NAT`、`ISOLATE_FLT`、`ISOLATE_FLT_IN` および関連 `PREROUTING` / `POSTROUTING` / `FORWARD` / `INPUT` ルールの削除。
5. `ISOLATE` ネットワーク名前空間、`iso_h` 仮想インターフェース、および `/etc/netns/ISOLATE` ディレクトリの削除。

---

## 注意点・制限事項
- **同時多重実行には非対応**: ネットワーク名前空間名（`ISOLATE`）、`veth` 名（`iso_h` / `iso_g`）、仮想サブネット（`10.222.0.0/24`）、および `iptables` チェーン名（`ISOLATE_FLT*`）が固定値のため、複数の `./isolate` インスタンスを同時に並列起動すると競合する。
- **ポート指定時のプロトコル**: ターゲットにポートを指定した場合（例: `example.com:443`）、`iptables` では TCP のみを許可する。ポートを省略した場合（例: `192.168.0.123`）はプロトコル制限なしで許可される。
- **許可ホスト名の照合は完全一致**: ワイルドカードやサブドメイン自動許可は行わない（`www.googleapis.com` を許可しても `sub.www.googleapis.com` は未許可扱いとなる）。
- **IPv6 無効**: 隔離インターフェースの IPv6 は無効化されるため、隔離環境内からは IPv4 通信のみが対象となる。
- **`/etc/hosts` 記載ホスト名**: `nsswitch.conf` は `files dns` のため、`localhost` 等 `/etc/hosts` に登録済みの名前はローカル解決される（ダミー IP 割り当て対象にはならない）。
