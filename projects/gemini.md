## gemini (WebUI) を快適にしたい

### 指示

```markdown
GEMINI.md ルールを厳守してくれ。
コード構造を把握する必要が出たら、必ず最初に documents/README.md 配下のサブドキュメントを参照してからコードファイルを確認してくれ。
まずは、OK とだけ返事をしてくれ。
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
