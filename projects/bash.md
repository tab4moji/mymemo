## シェルを便利にしたい

### 俺が考えた最強の alias 構築法

```bash
_() { local MYVAR="$1"; echo "${MYVAR}"; }; _ 'hello, world!'
```

```bash
$> alias myecho='_() { local MYVAR="$1"; echo "${MYVAR}"; }; _'
$> myecho 'hello, world!'
```

### 俺が考えた最強の reset

```bash
alias reset="_() { [ -t 0 ] && stty icanon echo echoe isig iexten icrnl opost -echok -istrip; printf '\033>\033[?25h\033%%G'; }; _"
```

### 俺が考えた最強の timeout

```bash
alias timeout='timeout --foreground --signal=INT --kill-after=3s'
```

### 俺が考えた最強の grep / find + vim

```bash
alias vimgrep='_() { vim -q <(\grep "$@") -c "autocmd FileType qf nnoremap <buffer> j j<CR><C-w>p" -c "autocmd FileType qf nnoremap <buffer> k k<CR><C-w>p" -c "autocmd FileType qf nnoremap <buffer> e <CR>" -c "cw" -c "autocmd VimEnter * wincmd j"; }; _'
alias vimfind='_() { vim --cmd "set efm=%f" -q <(\find "$@") -c "autocmd FileType qf nnoremap <buffer> j j<CR><C-w>p" -c "autocmd FileType qf nnoremap <buffer> k k<CR><C-w>p" -c "autocmd FileType qf nnoremap <buffer> e <CR>" -c "cw" -c "autocmd VimEnter * wincmd j"; }; _'
```

### 俺が考えた最強の cp

cpコマンドを便利化したい。

普通のcpに対する不満
**存在しないディレクトリへのコピーに失敗...mkdir -pを勝手にやって欲しい。
**進捗率不明...デカいファイルや遅いストレージにコピーし始めてから後悔する。あとからでも進捗を知りたいから、常に先回りでワイルドカードだったら全ファイルのサイズを調べておいて、実際のコピーのときは dd とかで通過したバイト数と経過時間から y = ax+b で a と b を予測して内部的に保持、/tmp/ の下に状況を常に更新して、終わったら消し去って欲しい。標準出力が tty だったらプログレスバーを自動で出して欲しい。パイプとか繋がったりシェルの中だったり表示すると問題がありそうだったら、表示しない。で、cp コマンドにないオプションを追加で、cp --status っての打つと、全 cp 中の状況を/tmp/ の下から拾ってきて表示。

Pythonの `argparse` のように、**ショートオプション (`-f`)**、**ロングオプション (`--file`)**、**値の割り当て (`--file=test.txt` や `--file test.txt`)**、そして**ヘルプ**を柔軟に処理できる、移植性の高いBashのボイラープレートを用意した。

外部コマンドの `getopt` は環境（BSD vs GNU）によって挙動が違うから、互換性を重視してビルトインの `while` と `case` で回すのが正解だ。

### Bash Argument Parsing Template

このスクリプトは以下のパターンをすべて正しく処理する。

* `script.sh -v --name=Gemini input.txt`
* `script.sh --verbose --name Gemini input.txt`
* `script.sh -vn Gemini input.txt` (ショートオプションの連結はこれだと複雑になるので、今回はシンプルさ重視で分離推奨だが、構造は拡張可能)

```bash
#!/bin/bash
set -euo pipefail

# 1. デフォルト値の設定
VERBOSE=false
TARGET_NAME="Guest"
OUTPUT_FILE=""
POSITIONAL_ARGS=()

# 2. ヘルプメッセージの定義
usage() {
    cat <<EOF
Usage: $(basename "${BASH_SOURCE[0]}") [OPTIONS] [ARGUMENTS]

Description:
  Pythonのargparse的なパラメータ解析を行うBashスクリプトのテンプレート。

Options:
  -n, --name NAME    名前を指定する (Default: Guest)
  -o, --output FILE  出力ファイルを指定する
  -v, --verbose      詳細ログを出力する
  -h, --help         このヘルプを表示する

Examples:
  $(basename "${BASH_SOURCE[0]}") --name="Gemini" -v input.dat
EOF
    exit 1
}

# 3. パラメータ解析ループ
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            # --- フラグ (値なし) ---
            -h|--help)
                usage
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            
            # --- 値付き引数 (-o val / --output=val / --output val) ---
            -n|--name)
                # "-n val" 形式
                if [[ -n "${2:-}" && ! ${2:-} =~ ^- ]]; then
                    TARGET_NAME="$2"
                    shift 2
                else
                    echo "Error: Argument for $1 is missing" >&2
                    exit 1
                fi
                ;;
            --name=*)
                # "--name=val" 形式
                TARGET_NAME="${1#*=}"
                shift
                ;;
            
            -o|--output)
                if [[ -n "${2:-}" && ! ${2:-} =~ ^- ]]; then
                    OUTPUT_FILE="$2"
                    shift 2
                else
                    echo "Error: Argument for $1 is missing" >&2
                    exit 1
                fi
                ;;
            --output=*)
                OUTPUT_FILE="${1#*=}"
                shift
                ;;

            # --- オプション終了 ---
            --)
                shift
                POSITIONAL_ARGS+=("$@")
                break
                ;;
            
            # --- 未知のオプション ---
            -*|--*)
                echo "Error: Unknown option $1" >&2
                usage
                ;;
            
            # --- 位置引数 (Positional Arguments) ---
            *)
                POSITIONAL_ARGS+=("$1")
                shift
                ;;
        esac
    done
}

# メイン処理実行
main() {
    parse_args "$@"
    
    # 位置引数を再セット (必要であれば)
    set -- "${POSITIONAL_ARGS[@]}"

    # --- デバッグ出力 (動作確認用) ---
    echo "--- Config ---"
    echo "VERBOSE     : ${VERBOSE}"
    echo "TARGET_NAME : ${TARGET_NAME}"
    echo "OUTPUT_FILE : ${OUTPUT_FILE:-<none>}"
    echo "POSITIONAL  : ${POSITIONAL_ARGS[*]}"
    echo "--------------"

    # ここにロジックを書く
    if [[ "$VERBOSE" == true ]]; then
        echo "Verbose mode is ON. Processing..."
    fi
}

main "$@"
```


### ソースコード: `xcp.py`

```python
#!/usr/bin/env python3
# this is a 🐍🐍🐍 code.
"""
xcp: Extended cp command.
Ver: 1.6.0
Date: 2026-01-20
Fix: '-a' option now implies '-r', '-d', and '-p'.
"""
import sys
import os
import time
import shutil
import argparse
import json
import fcntl
import struct
import math
import hashlib
from collections import deque

# --- Constants ---
STATUS_DIR = "/tmp"
STATUS_PREFIX = "xcp_status_"
CHUNK_SIZE = 1024 * 1024
HISTORY_LEN = 20
PROGRESS_THRESHOLD_SEC = 2.0

# --- Utils ---
def get_terminal_size():
    try:
        s = struct.unpack('HH', fcntl.ioctl(sys.stdout.fileno(), 0x5413, b'    '))
        return s[1]
    except Exception: return 80

def format_size(size):
    for unit in ['B', 'KiB', 'MiB', 'GiB']:
        if size < 1024: return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TiB"

def format_time(seconds):
    if seconds is None or math.isinf(seconds) or math.isnan(seconds): return "--:--"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"

def make_backup(path, suffix="~", method="simple"):
    if not os.path.exists(path): return
    if method == "none" or method == "off": return
    backup_path = path + suffix
    try:
        if os.path.exists(backup_path): os.remove(backup_path)
        shutil.move(path, backup_path)
    except OSError as e:
        print(f"Backup failed for {path}: {e}", file=sys.stderr)

# --- Logic ---
def update_status_file(pid, current, total, src, dst, speed, eta, phase="copy"):
    data = {
        "pid": pid, "phase": phase,
        "current_bytes": current, "total_bytes": total,
        "source": src, "dest": dst,
        "speed_bps": speed, "eta_sec": eta, "timestamp": time.time()
    }
    try:
        with open(os.path.join(STATUS_DIR, f"{STATUS_PREFIX}{pid}.json"), 'w') as f:
            json.dump(data, f)
    except OSError: pass

def print_progress(current, total, speed, eta, width, phase=""):
    if total <= 0: return
    percent = min(1.0, current / total)
    bar_len = max(5, width - 45)
    filled = int(bar_len * percent)
    bar = '=' * filled + '-' * (bar_len - filled)
    msg = f"\r{phase[:1]} [{bar}] {percent*100:5.1f}% | {format_size(speed)}/s | ETA {format_time(eta)}"
    sys.stdout.write(msg)
    sys.stdout.flush()

def clear_progress(width):
    sys.stdout.write("\r" + " " * width + "\r")
    sys.stdout.flush()

def scan_files(sources):
    total_size = 0
    file_list = []
    for src in sources:
        if os.path.isfile(src):
            s = os.path.getsize(src)
            total_size += s
            file_list.append((src, 'file', s))
        elif os.path.isdir(src):
            for root, _, files in os.walk(src):
                for f in files:
                    path = os.path.join(root, f)
                    if not os.path.islink(path):
                        try:
                            s = os.path.getsize(path)
                            total_size += s
                            file_list.append((path, 'dir_file', s))
                        except OSError: pass
    return total_size, file_list

def copy_file_worker(src, dst, state, total_size, file_size, args):
    def skip():
        state['copied'] += file_size
        update_ui(state, total_size, 0, 0, force=True)

    if os.path.exists(dst):
        if args.no_clobber:
            skip(); return
        if args.interactive:
            sys.stdout.write(f"\rxcp: overwrite '{dst}'? (y/n [n]) ")
            sys.stdout.flush()
            if sys.stdin.read(1).lower() != 'y':
                skip(); return
        
        if args.u or (args.update_opt and args.update_opt != 'all'):
            if args.update_opt == 'none': skip(); return
            if os.path.getmtime(dst) >= os.path.getmtime(src):
                skip(); return
        
        if args.b or args.backup_control:
            make_backup(dst, args.suffix or "~", args.backup_control or "simple")
        
        if args.force:
            try: os.remove(dst)
            except OSError: pass

    if args.symbolic_link:
        if os.path.exists(dst) and not args.force:
            print(f"xcp: {dst}: File exists", file=sys.stderr); skip(); return
        os.symlink(src, dst)
        return
    if args.link:
        if os.path.exists(dst): os.remove(dst)
        os.link(src, dst)
        skip(); return

    if args.checksum and os.path.exists(dst):
        if os.path.getsize(src) == os.path.getsize(dst):
            try:
                h1 = hashlib.md5(open(src,'rb').read()).digest()
                h2 = hashlib.md5(open(dst,'rb').read()).digest()
                if h1 == h2:
                    skip(); return
            except: pass

    if args.attributes_only:
        shutil.copystat(src, dst)
        skip(); return

    dst_dir = os.path.dirname(dst)
    if dst_dir and not os.path.exists(dst_dir):
        os.makedirs(dst_dir, exist_ok=True)

    try:
        with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
            while True:
                buf = fsrc.read(CHUNK_SIZE)
                if not buf: break
                fdst.write(buf)
                
                state['copied'] += len(buf)
                update_ui(state, total_size)
        
        if args.preserve or args.archive or args.p:
             shutil.copystat(src, dst)

    except Exception as e:
        print(f"\ncp: error copying {src}: {e}", file=sys.stderr)

def update_ui(state, total_size, force_speed=None, force_eta=None, force=False):
    now = time.time()
    state['history'].append((now, state['copied']))
    if len(state['history']) > HISTORY_LEN: state['history'].popleft()
    
    if now - state['last_update'] > 0.1 or force:
        n = len(state['history'])
        if n > 1:
            sx = sum(t for t,b in state['history'])
            sy = sum(b for t,b in state['history'])
            sxy = sum(t*b for t,b in state['history'])
            sxx = sum(t*t for t,b in state['history'])
            div = (n*sxx - sx*sx)
            a = (n*sxy - sx*sy) / div if div!=0 else 0
            speed = a if a>0 else 0
        else: speed = 0
        
        if force_speed is not None: speed = force_speed
        eta = (total_size - state['copied']) / speed if speed > 0 else 0
        if force_eta is not None: eta = force_eta

        elapsed = now - state['start_time']
        if not state['show_bar']:
            if (eta > PROGRESS_THRESHOLD_SEC) or (elapsed > PROGRESS_THRESHOLD_SEC):
                state['show_bar'] = True

        if state['is_tty'] and state['show_bar']:
            print_progress(state['copied'], total_size, speed, eta, state['term_width'])
        
        update_status_file(state['pid'], state['copied'], total_size, "...", "...", speed, eta)
        state['last_update'] = now

def cmd_status():
    print(f"{'PID':<8} {'Progress':<8} {'Speed':<12} {'ETA':<10} {'File'}")
    print("-" * 60)
    found = False
    for filename in os.listdir(STATUS_DIR):
        if filename.startswith(STATUS_PREFIX) and filename.endswith(".json"):
            path = os.path.join(STATUS_DIR, filename)
            try:
                with open(path, 'r') as f: data = json.load(f)
                if os.path.exists(f"/proc/{data['pid']}"):
                    pct = (data['current_bytes']/data['total_bytes'])*100 if data['total_bytes'] else 0
                    print(f"{data['pid']:<8} {pct:5.1f}%    {format_size(data['speed_bps']):<12} {format_time(data['eta_sec']):<10} {os.path.basename(data['source'])}")
                    found = True
                else: os.remove(path)
            except: pass
    if not found: print("No active xcp processes.")

def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("files", nargs="*", help="Sources and Destination")
    parser.add_argument("-a", "--archive", action="store_true")
    parser.add_argument("--attributes-only", action="store_true")
    parser.add_argument("-b", action="store_true")
    parser.add_argument("--backup", dest="backup_control", nargs="?", const="simple")
    parser.add_argument("--copy-contents", action="store_true")
    parser.add_argument("-d", action="store_true")
    parser.add_argument("-f", "--force", action="store_true")
    parser.add_argument("-i", "--interactive", action="store_true")
    parser.add_argument("-n", "--no-clobber", action="store_true")
    parser.add_argument("-l", "--link", action="store_true")
    parser.add_argument("-L", "--dereference", action="store_true")
    parser.add_argument("-P", "--no-dereference", action="store_true")
    parser.add_argument("-H", action="store_true")
    parser.add_argument("-p", action="store_true")
    parser.add_argument("--preserve", const="all", nargs="?")
    parser.add_argument("--no-preserve")
    parser.add_argument("--parents", action="store_true")
    parser.add_argument("-R", "-r", "--recursive", action="store_true")
    parser.add_argument("--reflink", nargs="?", const="always")
    parser.add_argument("--remove-destination", action="store_true")
    parser.add_argument("--sparse", nargs="?", const="auto")
    parser.add_argument("--strip-trailing-slashes", action="store_true")
    parser.add_argument("-s", "--symbolic-link", action="store_true")
    parser.add_argument("-S", "--suffix")
    parser.add_argument("-t", "--target-directory")
    parser.add_argument("-T", "--no-target-directory", action="store_true")
    parser.add_argument("--update", dest="update_opt", nargs="?", const="older")
    parser.add_argument("-u", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("-x", "--one-file-system", action="store_true")
    parser.add_argument("-Z", action="store_true")
    parser.add_argument("--context")
    parser.add_argument("--help", action="help")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("-c", "--checksum", action="store_true")

    args = parser.parse_args()

    if args.status:
        cmd_status(); return

    if not args.files:
        if not args.help: parser.print_usage()
        return
    
    # Fix: -a implies -r, -d, -p
    if args.archive:
        args.recursive = True
        args.d = True
        args.p = True

    if args.target_directory:
        dest = args.target_directory
        sources = args.files
    else:
        if len(args.files) < 2:
            print("xcp: missing destination file operand", file=sys.stderr)
            return
        dest = args.files[-1]
        sources = args.files[:-1]

    dest_is_dir = os.path.isdir(dest) or dest.endswith(os.sep) or len(sources) > 1 or args.target_directory
    if args.no_target_directory: dest_is_dir = False
    
    if not args.recursive and any(os.path.isdir(s) for s in sources):
        print("xcp: -r not specified; omitting directory", file=sys.stderr)
        sources = [s for s in sources if not os.path.isdir(s)]
    
    if not sources: return

    state = {
        'copied': 0, 'history': deque(), 'last_update': 0,
        'pid': os.getpid(), 'is_tty': sys.stdout.isatty(),
        'term_width': get_terminal_size(), 'start_time': time.time(),
        'show_bar': False
    }
    state['history'].append((state['start_time'], 0))
    
    total_size, file_list = scan_files(sources)
    
    try:
        for src, kind, size in file_list:
            if dest_is_dir:
                if kind == 'dir_file':
                    base_src = next((s for s in sources if src.startswith(s)), src)
                    rel = os.path.relpath(src, os.path.dirname(base_src))
                    final_dst = os.path.join(dest, rel)
                else:
                    final_dst = os.path.join(dest, os.path.basename(src))
            else:
                final_dst = dest
            
            copy_file_worker(src, final_dst, state, total_size, size, args)
            
        if state['is_tty'] and state['show_bar']: 
            print_progress(total_size, total_size, 0, 0, state['term_width'])
            clear_progress(state['term_width'])

    except KeyboardInterrupt:
        print("\nCancelled.")
    finally:
        status_file = os.path.join(STATUS_DIR, f"{STATUS_PREFIX}{state['pid']}.json")
        if os.path.exists(status_file): os.remove(status_file)

if __name__ == "__main__":
    main()
```

### マニュアルとの対応表

Pythonの制限や複雑さ回避のため、一部は「引数として受け取るが、詳細な動作は標準的または未実装」としている。

| オプション | 意味 | xcpでの対応状況 |
| --- | --- | --- |
| `-a`, `--archive` | アーカイブモード | 再帰、属性保持モードとして動作 |
| `-b`, `--backup` | バックアップ作成 | 実装済。`~`サフィックス等でリネーム |
| `-f`, `--force` | 強制上書き | 実装済。コピー前に削除試行 |
| `-i`, `--interactive` | 上書き確認 | 実装済。y/n 入力待ち |
| `-l`, `--link` | ハードリンク | 実装済。データコピーの代わりにリンク作成 |
| `-n`, `--no-clobber` | 上書き禁止 | 実装済。ファイルがあればスキップ |
| `-s`, `--symbolic-link` | シンボリックリンク | 実装済。データコピーの代わりにリンク作成 |
| `-u`, `--update` | 更新された時のみ | 実装済。タイムスタンプ比較 |
| `--attributes-only` | 属性のみ | 実装済。データコピーせず `copystat` のみ |

これで、`cp` のオプション体系を保ちつつ、便利なプログレスバーや予測機能を組み合わせることができる。
