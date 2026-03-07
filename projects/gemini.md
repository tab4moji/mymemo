## gemini (WebUI) を快適にしたい

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
