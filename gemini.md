## gemini (WebUI + agy CLI) を快適にしたい

### 指示

```markdown
GEMINI.md ルールを厳守してくれ。
コード構造を把握する必要が出たら、必ず最初に documents/README.md 配下のサブドキュメントを参照してからコードファイルを確認してくれ。
まずは、OK とだけ返事をしてくれ。
```

```markdown
# プロジェクト管理・自律記録プロトコル (GEMINI.md)

## 1. 絶対的使命 (Mission)
あなたは自律型のプロジェクトマネージャー兼シニアエンジニアだ。
最大の目的は「ユーザーに記録の指示を意識させないこと」。会話の文脈から仕様決定、タスク完了、アーキテクチャの変更を自動で検知し、自発的かつ継続的にプロジェクト状態を `.gemini_works/` に永続化せよ。

## 2. ディレクトリ構造 (.gemini_works/)
* `LATEST_STATE.md` : (最重要) 現在の最終確定状態、主要マイルストーン、次タスクのポインタのみを記録したスナップショット。会話再開時のコンテキストとなる。
* `index.md` : 全ドキュメントの目次と概要。
* `architecture/` : コンポーネントごとの詳細な仕様メモ。
* `journals/` : 日々の議論、試行錯誤、決定事項を時系列で記録するディレクトリ。

## 3. 自律実行シーケンス

### [BOOT] 会話開始・再開時
会話の最初のターンでは、必ず `.gemini_works/LATEST_STATE.md` の内容を読み込み、現在の前提条件を把握した上で応答を開始すること。

### [COMMIT] ターン終了時の自律記録 (絶対ルール)
ユーザーとの対話を通じて以下のいずれかが発生した場合は、**そのターンの回答の最後**に必ずファイル更新処理（シェルコマンド等）を出力すること。
1. `journals/` 配下の日報に議論の経緯と決定事項、実行コマンドを追記。
2. 構造に変更があれば `architecture/` 配下を更新。
3. **`LATEST_STATE.md` を上書き更新。** (過去の経緯は省き、現在の完成状況と次タスクのみを簡潔に記載)

## 4. 出力・ファイル分割制約 (絶対ルール)
* **6KiB制限:** プログラムのソースコードおよび説明用Markdownファイル（ジャーナル等も含む）は、処理や説明内容に合わせて細かく分割し、**各ファイルが絶対に6KiBを超えないようにすること。**
* 超過しそうな場合は自発的にファイルを分割し（例: `YYYY-MM-DD_part2.md`）、`index.md` や親ドキュメントからリンクする構造をとること。
* **コード記述の鉄則:**
  * プログラムの冒頭に目的と機能を簡潔に説明し、更新履歴（連番と日付）を付与すること。
  * 関数は単一return文とし、ガード節は例外ベースのエラー処理とすること。
  * エラーメッセージはエラー専用の出力を使うこと。
  * Pythonの場合はPEP 8規約とその理念を遵守すること。
* ファイル作成・更新時は、ユーザーがコピペ実行できるシェルコマンド（例: `cat << 'EOF' > ...`）で明確に出力すること。
* 提案は、既存アルゴリズムやツールで実現可能な最速・最短の手段を優先すること。

## 5. ジャーナルの記述フォーマット (絶対ルール)
日々のジャーナル（`journals/YYYY-MM-DD.md`）は、単なる感想ではなく「技術的な再現ログ」として機能させるため、以下の構造で記述すること。

```markdown
# YYYY-MM-DD: [主要なトピック概要]

## 1. 実行コマンドログ (最重要)
開発、ビルド、テスト、デバッグ等で**実際に使用した具体的なコマンドと引数**を、コピペ可能なコードブロックで必ず記録すること。
（例: パイプライン処理のテスト実行コマンド、特定モジュールの実行コマンドなど）

## 2. 試行錯誤と決定事項
* 何を試し、なぜ失敗/成功したか。
* 代替案の比較と、最終的にどういうアーキテクチャ・仕様に決定したか。

## 3. 保留・次タスク
* 未解決のバグや、明日に持ち越すタスク。
```

## 6. interraction アプリの試行

### 1. Overview and Purpose
`tryit` is a CLI tool and Python module designed to execute interactive commands or scripts safely within an isolated Tmux session. It is specifically useful for AI agents (like `gemini-cli`) to run potentially blocking or interactive programs with a strict timeout and robust logging.

#### Key Features
- **Timeout Management:** Automatically terminates the process tree if the command exceeds the specified execution time.
- **Log Capturing:** Uses `script` to capture full PTY output directly to a file without missing data upon timeout.
- **Environment Variable Inheritance:** Automatically passes the parent shell's environment variables to the isolated Tmux session.
- **Graceful Termination:** Allows user-triggered aborts (`q` key) and performs aggressive cleanup of child processes.

### 2. Prerequisites
The tool requires the following system dependencies:
- `python3`
- `tmux`
- `script` (util-linux)
- `pgrep` (procps)

### 3. CLI Usage
Run `tryit` via the command line to wrap your target command.

#### Basic Syntax
```bash
./tryit [OPTIONS] "TARGET_COMMAND"
```

#### Options

* `target` (Positional): The command or script to execute. Must be enclosed in quotes if it contains spaces or arguments.
* `-t, --timeout <seconds>`: Maximum allowed execution time in seconds. Defaults to `30.0`.
* `-s, --size <WIDTHxHEIGHT>`: Specifies the terminal size for the Tmux pane (e.g., `80x25`). Useful for forcing specific TUI dimensions.
* `-q, --quiet`: If provided, the terminal waits quietly without requiring user input to close the Tmux pane after completion.
* `-d, --detached`: Runs the Tmux session in the background without stealing terminal focus.
* `-l, --log-file <path>`: Specifies a custom path to save the command output log. If omitted, a temporary file is used and its contents are printed to standard output at the end.

### 4. Examples for `gemini-cli`

#### Example 1: Running an interactive script with a timeout

To run a TUI application or a script that waits for user input, capping it at 15 seconds:

```bash
./tryit -d -t 15.0 "python3 my_tui_app.py"
```

#### Example 2: Capturing output of a blocking process

To run a server or tail a log for exactly 5 seconds and save the output to a specific file:

```bash
./tryit -d -t 5.0 -l ./server_output.log "tail -f /var/log/syslog"
```

#### Example 3: Running a command with environment variables

`tryit` automatically inherits the current environment. Just set the variables before execution:

```bash
MY_API_KEY="secret" ./tryit -d -t 10 "printenv MY_API_KEY"
```

### 5. Exit Codes and Behavior

When the process finishes, `tryit` reports the outcome and exits with specific codes:

* **0 - 123:** The target command finished naturally, and `tryit` returns the command's original exit code.
* **124:** The command timed out and was forcefully terminated by `tryit`.
* **130:** The execution was aborted manually by the user (pressing `q` or `Ctrl+C`).

### 6. Using as a Python Module

`tryit` can also be imported and used directly inside other Python programs (e.g., as a replacement for `subprocess.run`).

```python
from tryit import TmuxExecutor

# Initialize executor
executor = TmuxExecutor(timeout=10.0, detached=True)

# Run command synchronously
result = executor.run("echo 'Hello World'; sleep 2")

print(f"Exit Code: {result.exit_code}")
print(f"Output: {result.stdout}")
print(f"Elapsed Time: {result.elapsed:.2f}s")
```
```

### markdown からファイル作成

車輪の再発明。
既存ツールは「正しいMarkdown構文」を前提としすぎている。「ファイル名がコメントで書いてある」「ファイル名が直前の行にある」といった**人間特有の曖昧さ（ヒューリスティック）**を拾ってくれるツールは意外とない。

文芸的プログラミング (Literate Programming)

* **codedown** (npm/C++)
* 一番メジャー。標準入力からMarkdownを受け取って、指定言語のブロックだけ吐き出す。
* *欠点:* 「ファイル名」を指定して複数ファイルを一気に切り出す機能が弱い。単純な抽出向け。

* **pandoc**
* ドキュメント変換の万能ナイフ。フィルタを書けば抽出できるが、設定が面倒。

* **nbdev** (Python)
* Jupyter Notebookからライブラリを生成する現代のデファクト。
* *欠点:* Notebook (.ipynb) ベースであり、純粋なMarkdown (.md) ファイルの処理には向かない。

* **Entangled**
* Markdownとソースコードを双方向同期させる変態的（褒め言葉）ツール。
* *欠点:* デーモンとして常駐させたり設定が必要で、サクッと「このMDからファイル復元して」という用途には重い。

```python
#!/usr/bin/env python3
# this is a 🐍🐍🐍 code.

"""
Markdown Code Extractor (enfile.py)

概要:
  Markdownファイル内のコードブロックを解析し、指定されたファイル名で保存する。
  Strictモードで確定させ、残ったブロックをFallbackモードで救済するハイブリッド仕様。

更新履歴:
  1. 2026-01-22: 変数初期化を徹底し、NameErrorを物理的に防止
  2. 2026-01-22: コードブロックの開閉判定ロジックを修正
  3. 2026-01-22: Strictで見つかったブロック以外をFallbackで埋める「補完ロジック」に変更
"""

import os
import re
import sys
import argparse
from typing import List, Tuple, Optional, Set, Dict

# --- 定数定義 (正規表現) ---
REGEX_FILENAME_CANDIDATE = r'(?<!\/)\b[\w\-./\\]+\.[a-zA-Z0-9]{1,10}\b'
REGEX_BLOCK_START = r'^(\s*)(`{3,}|~{3,})(.*)$'

def _read_file(filepath: str) -> str:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except OSError as e:
        print(f"Error: 読み込み失敗 - {filepath}\n{e}", file=sys.stderr)
        sys.exit(1)
    return ""

def _write_file(filepath: str, content: str) -> None:
    try:
        directory = os.path.dirname(filepath)
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Saved: {filepath}")
    except OSError as e:
        print(f"Error: 書き込み失敗 - {filepath}\n{e}", file=sys.stderr)

def _sanitize_filename(line: str) -> Optional[str]:
    """行からファイル名を抽出する"""
    line = line.strip()
    if not line: return None

    # マークダウン装飾除去
    clean_line = re.sub(r'^#+\s*', '', line)
    clean_line = clean_line.replace('**', '').replace('`', '').strip()

    # コメント記号除去
    if clean_line.startswith('#') or clean_line.startswith('//'):
        clean_line = re.sub(r'^[\#\/]+\s*', '', clean_line)

    if re.match(r'^[\w\-. /\\\\]+\.\w+$', clean_line):
        return clean_line.split()[-1]
    return None

def _parse_markdown_structure(markdown_text: str) -> Tuple[List[Dict], List[str]]:
    lines = markdown_text.splitlines()
    blocks = []
    text_lines = []
    
    n = len(lines)
    i = 0
    
    while i < n:
        line = lines[i]
        match = re.match(REGEX_BLOCK_START, line)
        if match:
            fence_char = match.group(2)[0]
            fence_len = len(match.group(2))
            block_content = []
            block_start_index = i
            i += 1
            while i < n:
                close_match = re.match(r'^(\s*)(`{3,}|~{3,})', lines[i])
                if close_match:
                    c_fence = close_match.group(2)
                    if c_fence[0] == fence_char and len(c_fence) >= fence_len:
                        break
                block_content.append(lines[i])
                i += 1
            
            blocks.append({
                "index": len(blocks),
                "start_line": block_start_index,
                "content": "\n".join(block_content),
                "filename": None  # ここにファイル名を格納していく
            })
        else:
            text_lines.append(line)
        i += 1
    return blocks, text_lines

def _apply_strict_naming(markdown_text: str, blocks: List[Dict]) -> Set[str]:
    """Strict判定を行い、blocksのfilenameフィールドを更新する。使用済みファイル名のセットを返す"""
    lines = markdown_text.splitlines()
    used_filenames = set()

    for block in blocks:
        if not block["content"].strip(): continue

        filename = None
        start_idx = block["start_line"]
        
        # 1. ブロック内1行目
        first_line = block["content"].split('\n')[0].strip()
        candidate = _sanitize_filename(first_line)
        if candidate and re.search(r'\.\w+$', candidate):
            filename = candidate

        # 2. ブロック直前(最大5行)
        if not filename:
            lookback = 1
            while lookback <= 5 and (start_idx - lookback) >= 0:
                prev_line = lines[start_idx - lookback]
                candidate = _sanitize_filename(prev_line)
                if candidate and re.search(r'\.\w+$', candidate):
                    filename = candidate
                    break
                lookback += 1
        
        if filename:
            block["filename"] = filename
            used_filenames.add(filename)

    return used_filenames

def _apply_fallback_naming(blocks: List[Dict], text_lines: List[str], used_filenames: Set[str]):
    """ファイル名が決まっていないブロックに対し、文中のファイル名候補を割り当てる"""
    
    # まだ名前のない空でないブロックを抽出
    target_blocks = [b for b in blocks if b["filename"] is None and b["content"].strip()]
    if not target_blocks:
        return

    # テキストからファイル名候補を抽出
    candidates = []
    seen = set(used_filenames) # 既にStrictで使われた名前は除外
    
    for line in text_lines:
        if "http" in line: continue
        matches = re.findall(REGEX_FILENAME_CANDIDATE, line)
        for name in matches:
            if name.lower() in ['node.js', 'react.js', 'vue.js', 'z3.solver', 'userland.tech', 'enfile.py']:
                continue
            name = name.rstrip('.')
            if name not in seen:
                candidates.append(name)
                seen.add(name)

    # マッピング実行
    limit = min(len(candidates), len(target_blocks))
    if limit > 0:
        print(f"Fallback: Assigning {limit} filenames to remaining blocks...")
        for i in range(limit):
            target_blocks[i]["filename"] = candidates[i]

def main():
    parser = argparse.ArgumentParser(description="Markdownからコードを抽出 (enfile)")
    parser.add_argument("input_file", help="入力Markdownファイル")
    parser.add_argument("--out", "-o", default=".", help="出力先ディレクトリ")
    args = parser.parse_args()

    md_content = _read_file(args.input_file)
    blocks, text_lines = _parse_markdown_structure(md_content)
    
    # 1. Strict実行
    used_names = _apply_strict_naming(md_content, blocks)

    # 2. 穴埋めFallback実行
    _apply_fallback_naming(blocks, text_lines, used_names)

    # 3. 保存処理
    count = 0
    print(f"Extracting to '{args.out}'...")
    
    for block in blocks:
        if block["filename"]:
            full_path = os.path.join(args.out, block["filename"])
            _write_file(full_path, block["content"])
            count += 1
            
    if count == 0:
        print("Warning: コードブロックは見つかりませんでした。")
    else:
        print(f"Done. ({count} files)")

if __name__ == "__main__":
    main()
```


### cli quota 表示

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import atexit
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import fcntl
import math
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import termios
import time
import tty
import unicodedata
import zoneinfo

# TTY 設定の保存と復元
ORIG_TERMIOS = None
if sys.stdin.isatty():
    try:
        ORIG_TERMIOS = termios.tcgetattr(sys.stdin.fileno())
        tty.setcbreak(sys.stdin.fileno())
    except Exception:
        ORIG_TERMIOS = None


def restore_tty():
    global ORIG_TERMIOS
    if ORIG_TERMIOS is not None and sys.stdin.isatty():
        try:
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, ORIG_TERMIOS)
        except Exception:
            pass
    sys.stdout.write("\x1b[?25h\n")
    sys.stdout.flush()


atexit.register(restore_tty)


def signal_handler(signum, frame):
    restore_tty()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
# 週次クォータ (5h以外) の余剰時間に加算する補正値 (時間)
WEEKLY_SURPLUS_OFFSET_HOURS = 1.0
AUTH_REQUIRED_RE = re.compile(
    r"authentication\s+required"
    r"|please\s+visit\s+the\s+url\s+to\s+log\s*in"
    r"|waiting\s+for\s+authentication"
    r"|paste\s+the\s+authorization\s+code"
    r"|not\s+logged\s+in"
    r"|please\s+run\s+/login"
    r"|please\s+log\s*in"
    r"|invalid\s+api\s+key"
    r"|login\s+required",
    re.IGNORECASE,
)


def wait_with_progress(
    total_seconds: float,
    model_lines: list[str],
    display: DisplayManager,
    tmux_target: str = "",
    esc_interval: float = 0.0,
    silent: bool = False,
    alert_indices: list[int] | None = None,
    alert_sources: set[str] | None = None,
) -> bool:
    """指定秒数待機しながらプログレスバーをリアルタイム更新する。
    esc_interval > 0 の場合、指定秒数間隔で対話的プロセスへ ESC を送信 (silent時はESC送信・警告音出力をスキップ)。
    alert_indices に含まれる行は、赤バック黄色文字と通常表示の入れ替わりで点滅させる。
    途中で 'q', 'Q', Ctrl-C (\\x03) が入力されたら True を返す。
    """
    start_time = time.time()
    end_time = start_time + total_seconds
    total_min = total_seconds / 60.0
    total_min_str = f"{total_min:g}" if total_min == int(total_min) else f"{total_min:.1f}"

    last_esc_time = 0.0

    while True:
        now = time.time()
        # esc_interval が設定されている場合、定期的に ESC を送信 (\a 出力)
        if esc_interval > 0.0 and (now - last_esc_time >= esc_interval):
            send_escapes(alert_sources or set(), tmux_target=tmux_target, silent=silent)
            last_esc_time = now

        elapsed = now - start_time
        if elapsed >= total_seconds:
            progress = 1.0
        else:
            progress = min(1.0, max(0.0, elapsed / total_seconds))

        num_hashes = min(10, math.ceil(progress * 10))
        bar = "#" * num_hashes + "." * (10 - num_hashes)
        elapsed_min = min(total_min, elapsed / 60.0)
        if esc_interval > 0.0:
            esc_info = " (サイレント待機中)" if silent else " (3秒毎ESC送信中)"
        else:
            esc_info = ""
        progress_line = f"[{bar}] {elapsed_min:.1f}/{total_min_str} min.{esc_info}"

        # 点滅制御: 0.5秒周期でトグル (赤バック黄色文字: \x1b[41;33;1m ... \x1b[0m)
        is_flash = (int(now * 2) % 2 == 1) if esc_interval > 0.0 else False

        rendered_model_lines = []
        for idx, line in enumerate(model_lines):
            if alert_indices and idx in alert_indices and is_flash:
                rendered_model_lines.append(f"\x1b[41;33;1m{line}\x1b[0m")
            else:
                rendered_model_lines.append(line)

        display.render([progress_line] + rendered_model_lines)

        if elapsed >= total_seconds:
            return False

        remaining = end_time - now
        timeout = min(remaining, 0.2)

        if sys.stdin.isatty():
            try:
                r, _, _ = select.select([sys.stdin], [], [], timeout)
                if r:
                    ch = sys.stdin.read(1)
                    if ch in ("q", "Q", "\x03"):
                        return True
            except (KeyboardInterrupt, InterruptedError):
                return True
        else:
            time.sleep(timeout)


def get_display_width(text: str) -> int:
    """東アジア文字幅（全角等）を考慮した表示桁数を計算（ANSIエスケープシーケンスを除外）"""
    clean_text = ANSI_ESCAPE_RE.sub("", text)
    width = 0
    for ch in clean_text:
        if unicodedata.east_asian_width(ch) in ("W", "F"):
            width += 2
        else:
            width += 1
    return width


class DisplayManager:
    def __init__(self):
        self.prev_line_widths = []

    def render(self, lines):
        num_prev = len(self.prev_line_widths)
        if num_prev > 0:
            if num_prev > 1:
                sys.stdout.write(f"\x1b[{num_prev - 1}A")
            sys.stdout.write("\r")

        new_widths = []
        for i, line in enumerate(lines):
            line_width = get_display_width(line)
            prev_width = self.prev_line_widths[i] if i < num_prev else 0
            pad = " " * max(0, prev_width - line_width)
            if i < len(lines) - 1:
                sys.stdout.write(f"\r{line}{pad}\n")
            else:
                sys.stdout.write(f"\r{line}{pad}")
            new_widths.append(max(line_width, prev_width if i < num_prev else 0))

        if num_prev > len(lines):
            for i in range(len(lines), num_prev):
                sys.stdout.write("\n\r" + " " * self.prev_line_widths[i] + "\r")
            diff = num_prev - len(lines)
            sys.stdout.write(f"\x1b[{diff}A\r")

        sys.stdout.flush()
        self.prev_line_widths = [get_display_width(l) for l in lines]


def parse_args():
    parser = argparse.ArgumentParser(
        description="agy と claude の usage を統合監視・クォータ余剰時間を正確に計算・管理するスクリプト"
    )
    parser.add_argument(
        "-m",
        "--model",
        "--mode",
        dest="target_models",
        default="0",
        help="監視対象の番号または名前 (カンマ区切りで複数可, デフォルト: 0, 例: -m 0 または -m Claude,claude-agy)",
    )
    parser.add_argument(
        "--tmux-target",
        dest="tmux_target",
        default="",
        help="agy / claude を tmux 内で動かしている場合のターゲット名 (例: 'main:0.0' や 'claude_pane')",
    )
    parser.add_argument(
        "-s",
        "--silent",
        action="store_true",
        help="ESCキー押下および \\a (警告音) 出力を行わないサイレントモード",
    )
    return parser.parse_args()


def parse_agy_reset_datetime(date_str: str) -> dt.datetime | None:
    """agy のリセット日時文字列 (ISO形式またはJST/UTC表記) をUTC datetimeに変換"""
    clean_str = date_str.strip()
    if not clean_str:
        return None

    parsed: dt.datetime | None = None
    if "T" in clean_str:
        try:
            parsed = dt.datetime.fromisoformat(clean_str.replace("Z", "+00:00"))
        except Exception:
            parsed = None

    if parsed is None:
        for tz_label, tz_obj in (("JST", dt.timezone(dt.timedelta(hours=9))), ("UTC", dt.timezone.utc)):
            if tz_label in clean_str:
                clean_ds = clean_str.replace(tz_label, "").strip()
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
                    try:
                        naive = dt.datetime.strptime(clean_ds, fmt)
                        parsed = naive.replace(tzinfo=tz_obj)
                        break
                    except Exception:
                        pass
                if parsed is not None:
                    break

    if parsed is None:
        try:
            parsed = dt.datetime.fromisoformat(clean_str)
        except Exception:
            return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    else:
        parsed = parsed.astimezone(dt.timezone.utc)

    return parsed


def is_unset_agy_reset(rst_dt: dt.datetime) -> bool:
    """Unixエポック0 (1970-01-01 09:00 JST 等) の未設定・無効リセット日時か判定する"""
    return rst_dt.year <= 1970


def is_agy_free_tier_output(models: list[dict]) -> bool:
    """agy -p '/usage' の出力形式から Gemini 無料枠かどうかを判定する。
    無料枠では Gemini の 5h 枠が存在せず (週次枠のみ)、Claude/GPT 枠のリセット日時が 1970-01-01 になる。
    """
    has_gemini_weekly = any(m["name"] == "Gemini" for m in models)
    has_gemini_5h = any(m["name"] == "Gemini 5h" for m in models)
    has_epoch_zero = any(m.get("is_unset") for m in models)
    return (has_gemini_weekly and not has_gemini_5h) or has_epoch_zero


def parse_claude_reset_datetime(date_str: str, now: dt.datetime) -> dt.datetime | None:
    """Claude のリセット日時表記（例: 'Nov 6, 7:40pm (Asia/Tokyo)' や '8pm (Asia/Tokyo)'）を UTC datetime に変換"""
    clean_str = date_str.strip()
    date_pattern = r"([A-Za-z]+)\s+(\d{1,2}),?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\((.*?)\))?"
    time_pattern = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\((.*?)\))?"

    m_date = re.search(date_pattern, clean_str, re.IGNORECASE)
    if m_date:
        month_name, day_str, hour_str, minute_str, ampm, tz_name = m_date.groups()
        months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        try:
            month = months.index(month_name.lower()[:3]) + 1
        except ValueError:
            return None
        day = int(day_str)
    else:
        m_time = re.search(time_pattern, clean_str, re.IGNORECASE)
        if not m_time:
            return None
        month = None
        day = None
        hour_str, minute_str, ampm, tz_name = m_time.groups()

    minute = int(minute_str) if minute_str else 0
    hour = int(hour_str)
    if ampm.lower() == "pm" and hour != 12:
        hour += 12
    elif ampm.lower() == "am" and hour == 12:
        hour = 0

    tz = dt.timezone.utc
    if tz_name:
        try:
            tz = zoneinfo.ZoneInfo(tz_name.strip())
        except Exception:
            if "tokyo" in tz_name.lower() or "jst" in tz_name.lower():
                tz = dt.timezone(dt.timedelta(hours=9))

    now_tz = now.astimezone(tz)
    if month is not None and day is not None:
        year = now_tz.year
        try:
            target_dt = dt.datetime(year, month, day, hour, minute, tzinfo=tz)
            # 年末年始などの年またぎ補正
            if (now_tz - target_dt).total_seconds() > 30 * 86400:
                target_dt = dt.datetime(year + 1, month, day, hour, minute, tzinfo=tz)
            elif (target_dt - now_tz).total_seconds() > 300 * 86400:
                target_dt = dt.datetime(year - 1, month, day, hour, minute, tzinfo=tz)
        except ValueError:
            return None
    else:
        try:
            target_dt = dt.datetime(now_tz.year, now_tz.month, now_tz.day, hour, minute, tzinfo=tz)
        except ValueError:
            return None
        if (now_tz - target_dt).total_seconds() > 5 * 60:
            target_dt += dt.timedelta(days=1)

    return target_dt.astimezone(dt.timezone.utc)


def _terminate_process(proc: subprocess.Popen) -> None:
    """起動した子プロセスグループを安全に終了させる"""
    if proc.poll() is not None:
        return
    try:
        pgid = os.getpgid(proc.pid)
    except Exception:
        pgid = None

    try:
        if pgid is not None and pgid != os.getpgrp():
            os.killpg(pgid, signal.SIGTERM)
        else:
            proc.terminate()
    except Exception:
        pass

    try:
        proc.wait(timeout=2.0)
        return
    except subprocess.TimeoutExpired:
        pass
    except Exception:
        return

    try:
        if pgid is not None and pgid != os.getpgrp():
            os.killpg(pgid, signal.SIGKILL)
        else:
            proc.kill()
        proc.wait(timeout=1.0)
    except Exception:
        pass


def run_usage_command(cmd: list[str], timeout: float = 30.0) -> tuple[str, str]:
    """usage 取得コマンドをストリーミング実行し、認証要求を検知したら即座に中断する。
    戻り値は (status, output) で、status は 'ok' / 'auth_required' / 'error'。
    """
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        return "error", ""

    assert proc.stdout is not None
    fd = proc.stdout.fileno()
    chunks: list[bytes] = []
    deadline = time.monotonic() + timeout
    timed_out = False

    def _has_auth_prompt(text: str) -> bool:
        return bool(AUTH_REQUIRED_RE.search(ANSI_ESCAPE_RE.sub("", text)))

    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                break

            rlist, _, _ = select.select([fd], [], [], min(0.2, remaining))
            if fd not in rlist:
                continue

            data = os.read(fd, 4096)
            if not data:
                break
            chunks.append(data)

            output = b"".join(chunks).decode("utf-8", errors="replace")
            if _has_auth_prompt(output):
                _terminate_process(proc)
                return "auth_required", output

        output = b"".join(chunks).decode("utf-8", errors="replace")
        if timed_out:
            _terminate_process(proc)
            return ("auth_required" if _has_auth_prompt(output) else "error"), output

        wait_timeout = max(0.1, min(2.0, deadline - time.monotonic()))
        try:
            rc = proc.wait(timeout=wait_timeout)
        except subprocess.TimeoutExpired:
            _terminate_process(proc)
            return ("auth_required" if _has_auth_prompt(output) else "error"), output

        if _has_auth_prompt(output):
            return "auth_required", output
        return ("ok" if rc == 0 else "error"), output
    except Exception:
        _terminate_process(proc)
        output = b"".join(chunks).decode("utf-8", errors="replace")
        return ("auth_required" if _has_auth_prompt(output) else "error"), output
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass


def get_agy_usage() -> tuple[str, list[dict]]:
    """agy -p '/usage' を実行してパースする"""
    status, output = run_usage_command(["agy", "-p", "/usage"], timeout=30.0)
    if status != "ok":
        return status, []

    models = []
    pattern = re.compile(
        r"^(.*?)(?:\t+|\s{2,})(.*?(?:weekly|five\s+hour).*?)(?:\t+|\s{2,})(\d+(?:\.\d+)?)%(?:\t+|\s{2,})(.*?)$",
        re.IGNORECASE,
    )

    for line in output.splitlines():
        line_clean = line.strip()
        low = line_clean.lower()
        if not line_clean or ("weekly" not in low and "five hour" not in low):
            continue
        m = pattern.search(line_clean)
        if m:
            group_name = m.group(1).strip()
            gl = group_name.lower()
            if "argon" in gl:
                short_name = "Argon"
            elif "gemini" in gl:
                short_name = "Gemini"
            elif "claude" in gl or "gpt" in gl:
                short_name = "Claude"
            else:
                short_name = group_name
            is_short = "five hour" in m.group(2).lower()
            window_hours = 5.0 if is_short else 7 * 24.0
            if is_short:
                short_name += " 5h"

            remaining_pct = float(m.group(3))
            used_pct = max(0.0, 100.0 - remaining_pct)
            rst_dt = parse_agy_reset_datetime(m.group(4))
            if rst_dt is None:
                continue

            is_unset = is_unset_agy_reset(rst_dt)
            models.append({
                "source": "agy",
                "name": short_name,
                "used_pct": used_pct,
                "window_hours": window_hours,
                "reset_dt": None if is_unset else rst_dt,
                "is_unset": is_unset,
            })

    is_free_tier = is_agy_free_tier_output(models)
    if not is_free_tier:
        models = [m for m in models if not m["is_unset"]]
    for m in models:
        m["is_free_tier"] = is_free_tier

    return "ok", models


def get_claude_usage(now: dt.datetime) -> tuple[str, list[dict]]:
    """claude -p '/usage' を実行してパースする"""
    status, output = run_usage_command(["claude", "-p", "/usage"], timeout=30.0)
    if status != "ok":
        return status, []

    models = []
    # 例:
    # Current session: 0% used · resets Nov 6, 7:40pm (Asia/Tokyo)
    # Current week (all models): 0% used · resets Nov 12, 1am (Asia/Tokyo)
    pattern = re.compile(
        r"^(Current\s+[a-zA-Z0-9_]+(?:\s*\([^)]*\))?):\s*(\d+(?:\.\d+)?)%\s*used(?:.*?resets[ \t]+([^\r\n]*?))?[ \t]*$",
        re.IGNORECASE | re.MULTILINE,
    )

    for m in pattern.finditer(output):
        raw_name = m.group(1).strip()
        used_pct = float(m.group(2))
        reset_str = m.group(3).strip() if m.group(3) else ""

        lower_name = raw_name.lower()
        # Claude はモデル別管理ではないので「session(5h)」と「week (all models)」のみ対象
        if "session" in lower_name:
            name = "Claude 5h"
            window_hours = 5.0
        elif "week" in lower_name and "all" in lower_name:
            name = "Claude"
            window_hours = 7 * 24.0
        else:
            continue

        rst_dt = parse_claude_reset_datetime(reset_str, now) if reset_str else None
        if rst_dt is None and window_hours != 5.0 and used_pct > 0.0:
            continue

        models.append({
            "source": "claude",
            "name": name,
            "used_pct": used_pct,
            "window_hours": window_hours,
            "reset_dt": rst_dt,
        })

    return "ok", models


def get_usage_info(
    has_agy: bool, has_claude: bool
) -> tuple[list[dict], dt.datetime, list[str], bool]:
    """利用可能なコマンド (agy / claude) から usage 情報を取得・統合する"""
    now = dt.datetime.now(dt.timezone.utc)
    agy_status = "error"
    claude_status = "error"
    agy_models: list[dict] = []
    claude_models: list[dict] = []

    def _safe_call(fn, *args) -> tuple[str, list[dict]]:
        try:
            res = fn(*args)
            if isinstance(res, tuple) and len(res) == 2:
                return res[0], res[1] or []
            return "error", []
        except Exception:
            return "error", []

    if has_agy and has_claude:
        with ThreadPoolExecutor(max_workers=2) as executor:
            agy_future = executor.submit(_safe_call, get_agy_usage)
            claude_future = executor.submit(_safe_call, get_claude_usage, now)
            agy_status, agy_models = _safe_call(agy_future.result)
            claude_status, claude_models = _safe_call(claude_future.result)
    elif has_agy:
        agy_status, agy_models = _safe_call(get_agy_usage)
    elif has_claude:
        claude_status, claude_models = _safe_call(get_claude_usage, now)

    enabled_sources: list[str] = []
    auth_required_sources: list[str] = []
    if has_claude:
        enabled_sources.append("claude")
        if claude_status == "auth_required":
            auth_required_sources.append("claude")
    if has_agy:
        enabled_sources.append("agy")
        if agy_status == "auth_required":
            auth_required_sources.append("agy")

    all_auth_required = bool(enabled_sources) and len(auth_required_sources) == len(enabled_sources)
    if not agy_models and not claude_models:
        return [], now, auth_required_sources, all_auth_required

    # claude 側のモデルとベース名が重複する場合、agy 側の Claude (5h含む) を claude-agy として区別する
    claude_base_names = {m["name"].split()[0] for m in claude_models}
    for m in agy_models:
        if m["name"].split()[0] in claude_base_names:
            if m["name"].endswith(" 5h"):
                m["name"] = "claude-agy 5h"
            else:
                m["name"] = "claude-agy"

    models = claude_models + agy_models

    # claude を先頭、次に agy (Gemini, Argon, claude-agy) の順に並べ、各グループ内は短時間(5h)制限を先頭にする
    source_order = {"claude": 0, "agy": 1}
    agy_order = {"Gemini": 0, "Argon": 1, "claude-agy": 2, "Claude": 3}
    models.sort(
        key=lambda x: (
            source_order.get(x["source"], 9),
            agy_order.get(x["name"].split()[0], 9),
            x["window_hours"],
        )
    )

    return models, now, auth_required_sources, all_auth_required


def format_hours(val: float) -> str:
    """h.hhp 時間の p を切り捨てて h.hh 表記にする"""
    sign = "-" if val < 0 else ""
    abs_v = abs(val)
    trunc_v = math.floor(abs_v * 100.0 + 1e-9) / 100.0
    return f"{sign}{trunc_v:.2f}"


def get_tmux_pane_map() -> dict[str, str]:
    """tmux の tty -> pane_target (例: '/dev/pts/9' -> 'tmux_pi:1.1') の辞書を取得"""
    try:
        out = subprocess.check_output(
            ["tmux", "list-panes", "-a", "-F", "#{session_name}:#{window_index}.#{pane_index} #{pane_tty}"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        pane_map = {}
        for line in out.strip().splitlines():
            parts = line.strip().split()
            if len(parts) == 2:
                pane_map[parts[1]] = parts[0]
        return pane_map
    except Exception:
        return {}


def send_escape_via_tty(pid: int) -> bool:
    """プロセスの stdin TTY に対して TIOCSTI で ESC (\\x1b) を注入 (フォールバック)"""
    try:
        tty_path = os.readlink(f"/proc/{pid}/fd/0")
        if tty_path.startswith("/dev/"):
            with open(tty_path, "w") as fd:
                fcntl.ioctl(fd, termios.TIOCSTI, b"\x1b")
            return True
    except Exception:
        pass
    return False


def get_interactive_pids(target_cmd: str) -> list[int]:
    """非対話オプション (-p / --prompt / --print) や quota 監視スクリプトを除外した対話的プロセスの PID を取得"""
    try:
        pids_str = subprocess.check_output(["pgrep", "-f", target_cmd], text=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

    my_pid = os.getpid()
    target_pids = []
    for p in pids_str.strip().splitlines():
        if not p.isdigit():
            continue
        pid = int(p)
        if pid == my_pid:
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmdline = f.read().decode("utf-8", errors="ignore").split("\x00")
            if not cmdline or not cmdline[0]:
                continue
            joined = " ".join(cmdline)
            if "quota" in joined or "quoata" in joined:
                continue
            if any(
                arg in ("-p", "--prompt", "--print")
                or arg.startswith("--prompt=")
                or arg.startswith("--print=")
                or arg.startswith("-p=")
                for arg in cmdline
            ):
                continue
            exe_name = os.path.basename(cmdline[0])
            if target_cmd in exe_name or any(target_cmd == arg for arg in cmdline):
                target_pids.append(pid)
        except Exception:
            pass
    return target_pids


def send_escapes(sources: set[str], tmux_target: str = "", silent: bool = False):
    """対象の対話的プロセス (agy / claude) に対して 50ms 間隔で 2 回 ESC を送信 (silent時はスキップ)"""
    if silent:
        return

    if tmux_target:
        for _ in range(2):
            subprocess.run(["tmux", "send-keys", "-t", tmux_target, "Escape"], stderr=subprocess.DEVNULL)
            sys.stdout.write("\a")
            sys.stdout.flush()
            time.sleep(0.05)
        return

    pids: list[int] = []
    for src in sorted(sources):
        pids.extend(get_interactive_pids(src))

    if not pids:
        for _ in range(2):
            sys.stdout.write("\a")
            sys.stdout.flush()
            time.sleep(0.05)
        return

    tmux_pane_map = get_tmux_pane_map()

    for pid in pids:
        try:
            tty_path = os.readlink(f"/proc/{pid}/fd/0")
        except Exception:
            tty_path = ""

        if tty_path and tty_path in tmux_pane_map:
            pane = tmux_pane_map[tty_path]
            for _ in range(2):
                subprocess.run(["tmux", "send-keys", "-t", pane, "Escape"], stderr=subprocess.DEVNULL)
                sys.stdout.write("\a")
                sys.stdout.flush()
                time.sleep(0.05)
        else:
            for _ in range(2):
                send_escape_via_tty(pid)
                sys.stdout.write("\a")
                sys.stdout.flush()
                time.sleep(0.05)


def is_target_model(index: int, name: str, targets: list[str]) -> bool:
    """指定されたターゲット一覧 (インデックス番号または名前) に一致するか判定"""
    for t in targets:
        if t.isdigit():
            if int(t) == index:
                return True
        else:
            if t == name.lower() or t in name.lower():
                return True
    return False


def main():
    args = parse_args()

    has_agy = shutil.which("agy") is not None
    has_claude = shutil.which("claude") is not None

    if not has_agy and not has_claude:
        print("エラー: agy と claude のどちらのコマンドも見つかりません。", file=sys.stderr)
        sys.exit(1)

    targets = [x.strip().lower() for x in args.target_models.split(",") if x.strip()]

    display = DisplayManager()
    jst = dt.timezone(dt.timedelta(hours=9))

    last_lines: list[str] = []
    while True:
        models, now, auth_required_sources, all_auth_required = get_usage_info(has_agy, has_claude)

        if all_auth_required:
            if display.prev_line_widths:
                sys.stdout.write("\n")
                sys.stdout.flush()
            src_list = " と ".join(auth_required_sources)
            print(
                f"エラー: {src_list} が未認証です。先にログインしてください。",
                file=sys.stderr,
            )
            sys.exit(1)

        if not models:
            fallback_lines = last_lines or [
                f"  {src}: 未認証 (ログインが必要)" for src in auth_required_sources
            ]
            if wait_with_progress(60, fallback_lines, display, silent=args.silent):
                break
            continue

        parsed_models = []
        for i, m in enumerate(models):
            name = m["name"]
            source = m["source"]
            used_pct = m["used_pct"]
            window_hours = m["window_hours"]
            rst_dt = m["reset_dt"]
            is_unset = m.get("is_unset", False)

            consumed_hours = window_hours * (used_pct / 100.0)

            if is_unset:
                # 無料枠の 1970-01-01 等 (未設定・無効枠) は 5h/週次ともに -.-- (Rst. -) 表示とし、アラート誤爆を防ぐ
                surplus_hours = window_hours
                equiv_str = "-.--"
            elif window_hours == 5.0:
                # 5h制限は開始時点を 5.00 時間とし、消費に応じて減算する
                surplus_hours = max(0.0, window_hours - consumed_hours)
                equiv_str = format_hours(surplus_hours)
            elif rst_dt is None:
                # リセット日時不明の未使用週次枠はアラート誤爆を防ぐため正の余剰扱いとする
                surplus_hours = window_hours
                equiv_str = "-.--"
            else:
                sec_to_rst = (rst_dt - now).total_seconds()
                start_dt = rst_dt - dt.timedelta(hours=window_hours)
                elapsed_hours = max(0.0, (now - start_dt).total_seconds() / 3600.0)

                # 余剰時間 (経過時間 - 消費相当時間) に週次補正 (+1.00時間) を加算
                surplus_hours = elapsed_hours - consumed_hours + WEEKLY_SURPLUS_OFFSET_HOURS
                if used_pct <= 0.0:
                    surplus_hours = max(0.0, surplus_hours)
                elif used_pct >= 100.0 or sec_to_rst <= 0:
                    surplus_hours = min(0.0, surplus_hours)

                # 未使用 (0% used) の場合は余剰を算出せず -.-- 表示
                equiv_str = "-.--" if used_pct <= 0.0 else format_hours(surplus_hours)

            if rst_dt is not None:
                rst_jst = rst_dt.astimezone(jst)
                rst_str = f"{rst_jst.month}/{rst_jst.day} {rst_jst.hour}:{rst_jst.minute:02d} JST"
            else:
                rst_str = "-"

            parsed_models.append({
                "index": i,
                "source": source,
                "name": name,
                "surplus_hours": surplus_hours,
                "equiv_str": equiv_str,
                "rst_str": rst_str,
                "is_free_tier": m.get("is_free_tier", False),
            })

        label_candidates = [pm["name"] for pm in parsed_models] + auth_required_sources
        max_label_len = max(len(lbl) for lbl in label_candidates) if label_candidates else 0
        max_time_len = max(len(pm["equiv_str"]) for pm in parsed_models) if parsed_models else 0
        five_hour_parents = {
            (pm["source"], pm["name"][:-3])
            for pm in parsed_models
            if pm["name"].endswith(" 5h")
        }

        lines = []
        watched_surpluses = []
        alert_indices = []
        alert_sources: set[str] = set()

        for pm in parsed_models:
            i = pm["index"]
            name = pm["name"]
            source = pm["source"]
            equiv_str = pm["equiv_str"]
            rst_str = pm["rst_str"]
            surplus_hours = pm["surplus_hours"]

            matched = is_target_model(i, name, targets)
            prefix = "* " if matched else "  "
            line_idx = len(lines)
            if name.endswith(" 5h"):
                indent = ""
            elif pm["is_free_tier"] and (source, name) not in five_hour_parents:
                indent = ""  # 無料枠で親の5h行が無い週次行 (Gemini等) はインデントしない
            else:
                indent = "  "  # 週次は2文字インデントで階層表示 (有料枠の Argon 等も含む)
            lines.append(
                f"{prefix}{indent}{name:<{max_label_len}}: 余剰 {equiv_str:>{max_time_len}} 時間 (Rst. {rst_str})"
            )

            if matched:
                watched_surpluses.append(surplus_hours)
                if surplus_hours <= 0.0:
                    alert_indices.append(line_idx)
                    alert_sources.add(source)

        for src in auth_required_sources:
            lines.append(f"  {src:<{max_label_len}}: 未認証 (ログインが必要)")

        last_lines = lines

        if not watched_surpluses:
            if wait_with_progress(60, lines, display, silent=args.silent):
                break
            continue

        min_surplus = min(watched_surpluses)

        # 1. 余剰が 0.00 時間以下の場合は 3秒に1回 ESC (silent時はESC押下・警告音なし) を送りつつ 10分待機（10分毎にクォータ再取得）
        if min_surplus <= 0.0:
            if wait_with_progress(
                10 * 60,
                lines,
                display,
                tmux_target=args.tmux_target,
                esc_interval=3.0,
                silent=args.silent,
                alert_indices=alert_indices,
                alert_sources=alert_sources,
            ):
                break
            continue

        # 2. 余剰が 0.50 時間 (30分) 以上なら 5分、0.50 時間未満なら 3分待機
        if min_surplus >= 0.50:
            interval_sec = 5 * 60  # 300秒
        else:
            interval_sec = 3 * 60  # 180秒

        if wait_with_progress(interval_sec, lines, display, silent=args.silent):
            break


if __name__ == "__main__":
    main()
```
