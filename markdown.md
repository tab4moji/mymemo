## Markdown

### 解凍ツール

```python:md_extract.py
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "wcwidth",
# ]
# ///
# -*- coding: utf-8 -*-
"""
Markdown File Extractor & Writer (TUI)

Markdown ファイルからソースコードブロックと対応するファイルパスを抽出し、
ターミナル上でインタラクティブに確認・選択（トグル）してファイルシステムに書き込むツール。
"""

import os
import sys
import re
import locale
import curses
import argparse
from pathlib import Path
from typing import List, Optional, Tuple

# Locale setup for UTF-8 support in curses
try:
    locale.setlocale(locale.LC_ALL, "")
except Exception:
    pass

# Character width calculation
try:
    import wcwidth
    def char_width(c: str) -> int:
        w = wcwidth.wcwidth(c)
        return max(0, w) if w is not None else 1
except ImportError:
    def char_width(c: str) -> int:
        return 2 if ord(c) > 0x7F else 1

def str_display_width(s: str) -> int:
    return sum(char_width(c) for c in s)

def truncate_str(s: str, max_width: int, ellipsis: str = "...") -> str:
    if max_width <= 0:
        return ""
    if str_display_width(s) <= max_width:
        return s

    e_w = str_display_width(ellipsis)
    target_w = max_width - e_w
    if target_w <= 0:
        res = []
        cur_w = 0
        for c in s:
            w = char_width(c)
            if cur_w + w > max_width:
                break
            res.append(c)
            cur_w += w
        return "".join(res)

    res = []
    cur_w = 0
    for c in s:
        w = char_width(c)
        if cur_w + w > target_w:
            break
        res.append(c)
        cur_w += w
    return "".join(res) + ellipsis

def format_size(num_bytes: Optional[int]) -> str:
    if num_bytes is None:
        return "-"
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    else:
        return f"{num_bytes / (1024 * 1024):.1f} MB"


def is_valid_filepath(token: str) -> bool:
    token = token.strip(" `*\"':;,()[]{}#")
    if not token or len(token) > 255:
        return False
    if token.startswith("http://") or token.startswith("https://"):
        return False
    if any(c in token for c in ["<", ">", "\"", "|", "?", "*"]):
        return False
    if re.search(r"\s", token):
        return False

    has_slash = "/" in token or "\\" in token
    filename = token.replace("\\", "/").split("/")[-1]
    has_ext = bool(re.search(r"\.[a-zA-Z0-9_-]{1,10}$", filename))

    if filename in [".", "..", "...", "etc.", "example.com"]:
        return False
    if not (has_slash or has_ext):
        return False
    return True


def strip_filepath_decorations(text: str) -> str:
    """見出しやリストから番号・箇条書き・ラベル・強調などの装飾を剥がす。"""
    text = text.strip()
    prev = None
    while prev != text:
        prev = text
        # 外側のマークダウン強調 (** や * や __ や _)
        if (text.startswith("**") and text.endswith("**")) or (
            text.startswith("__") and text.endswith("__")
        ):
            text = text[2:-2].strip()
        elif (text.startswith("*") and text.endswith("*")) or (
            text.startswith("_") and text.endswith("_")
        ):
            text = text[1:-1].strip()

        # 箇条書き記号 (例: "-", "*", "+", "・", "■", "◆", "●", "▲", "▼")
        text = re.sub(r"^[-*+・■◆●▲▼]\s*", "", text).strip()

        # 括弧付き番号 (例: "[1]", "(1)", "（1）", "【1】")
        text = re.sub(r"^[\[\(（【]\s*\d+\s*[\]\)）】]\s*", "", text).strip()

        # 番号・ステップ (例: "1.", "1-", "1)", "1:", "1：", "①", "Step 1:", "No. 1:")
        text = re.sub(
            r"^(?:(?:step|ステップ|その|no\.?|第\s*\d+\s*(?:章|節|部)?)\s*[:：.-]*\s*\d*[\s:：.-]*|\d+[\.\-\)）:：]\s*|[①-⑳]\s*)",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        # ラベル (例: "File:", "Path:", "ファイル:", "ファイル名:", "ファイルパス:")
        text = re.sub(
            r"^(?:file|filepath|path|ファイル(?:名|パス)?)\s*[:：]\s*",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

    return text


def extract_filepath_from_line(line: str, is_heading: bool = False) -> Optional[str]:
    text = line.strip()
    if not text:
        return None

    if is_heading:
        # Strip leading #
        text = re.sub(r"^#{1,6}\s*", "", text).strip()

    stripped = strip_filepath_decorations(text)

    # 1. 装飾除去後、行全体がファイルパスそのものである場合
    cleaned = stripped.strip(" `*\"'()[]{}#:")
    if is_valid_filepath(cleaned):
        return cleaned

    # 見出し専用の高度な抽出パターン
    if is_heading:
        # 2. 先頭がファイルパスで、後ろに説明や注記が続く場合
        # e.g., "src/leg_protector.py (新設)", "`src/arm_protector.py` (腕専用化)", "src/foo.py - 新規"
        m = re.match(
            r"^[`*\"']?([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9_\-]{1,10})[`*\"']?(?:\s*[\(（].*?[\)）]|\s*[-:：].*|\s+.*)?$",
            stripped,
        )
        if m and is_valid_filepath(m.group(1)):
            return m.group(1).strip()

        # 3. 末尾が括弧やコロン・ハイフン区切りでファイルパスになっている場合
        # e.g., "スキャナ実装 (`scanner.py`)", "メインスクリプト: `src/main.py`"
        m_paren = re.search(
            r"[\(（]\s*[`*\"']?([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9_\-]{1,10})[`*\"']?\s*[\)）]\s*$",
            stripped,
        )
        if m_paren and is_valid_filepath(m_paren.group(1)):
            return m_paren.group(1).strip()

        m_suffix = re.search(
            r"(?:[:：\-–—]|\s+)\s*[`*\"']?([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9_\-]{1,10})[`*\"']?\s*$",
            stripped,
        )
        if m_suffix and is_valid_filepath(m_suffix.group(1)):
            return m_suffix.group(1).strip()

        # 4. 見出し内にバッククォート囲みのファイルパスが単一だけ存在する場合
        # e.g., "### `src/scanner.py` の修正方針"
        inline_paths = [
            p.strip()
            for p in re.findall(
                r"`([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9_\-]{1,10})`", stripped
            )
            if is_valid_filepath(p.strip())
        ]
        if len(inline_paths) == 1:
            return inline_paths[0]

    return None


def extract_filepath_from_code_info(info: str) -> Optional[str]:
    if not info:
        return None
    # Attribute match: filename="foo.py"
    m = re.search(
        r'(?:filename|file|path|title)=["\']([^"\']+)["\']',
        info,
        flags=re.IGNORECASE,
    )
    if m and is_valid_filepath(m.group(1)):
        return m.group(1).strip()

    # Colon syntax: python:src/main.py
    if ":" in info:
        cand = info.split(":", 1)[1].strip()
        if is_valid_filepath(cand):
            return cand

    # Space separated: python src/main.py
    tokens = info.split()
    for t in tokens[1:]:
        cand = t.strip()
        if is_valid_filepath(cand):
            return cand

    return None


class ExtractedFile:
    def __init__(self, rel_path: str, content: str, lang: str = ""):
        # Sanitize path (strip leading slashes / dots to prevent root overwrite)
        norm = os.path.normpath(rel_path.replace("\\", "/")).replace("\\", "/")
        norm = re.sub(r"^(\.\./)+", "", norm)
        norm = norm.lstrip("/")
        self.rel_path = norm
        self.content = content
        self.lang = lang
        self.selected = False
        self.status = "NEW"  # "NEW", "OVERWRITE", "IDENTICAL"
        self.existing_size: Optional[int] = None
        self.new_size: int = len(content.encode("utf-8"))
        self.content_lines = content.splitlines()

    def check_existing(self, base_dir: Path):
        target = base_dir / self.rel_path
        if not target.exists():
            self.status = "NEW"
            self.selected = True
            self.existing_size = None
        else:
            try:
                existing_bytes = target.read_bytes()
                new_bytes = self.content.encode("utf-8")
                self.existing_size = len(existing_bytes)
                if existing_bytes == new_bytes:
                    self.status = "IDENTICAL"
                    self.selected = False
                else:
                    self.status = "OVERWRITE"
                    self.selected = True
            except Exception:
                self.status = "OVERWRITE"
                self.selected = True
                self.existing_size = None

    def write_to_disk(self, base_dir: Path) -> Tuple[bool, str]:
        target = base_dir / self.rel_path
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(self.content.encode("utf-8"))
            self.check_existing(base_dir)
            return True, f"書き込み完了: {self.rel_path}"
        except Exception as e:
            return False, f"書き込み失敗 {self.rel_path}: {e}"


def sanitize_code_content(code_text: str) -> str:
    """
    コード内に紛れ込んだ Markdown リンク（例: ' [civitai](https://...)' など）を除去し、
    AI による参照番号誤置換で壊れた配列インデックスを文脈に基づき自動復元する。
    """
    cleaned_lines = []
    for line in code_text.splitlines():
        # 1. 数字のリンク [1](url) -> [1] に復元
        line = re.sub(r"\[(\d+)\]\([^\)\n]+\)", r"[\1]", line)

        # 2. YOLO/bbox 特有の AI 誤変換インデックスの自動修復
        # score = pred [link] -> score = pred[4]
        line = re.sub(
            r"(\bpred)\s*\[[^\]\n]+\]\([^\)\n]+\)",
            r"\1[4]",
            line,
        )

        # p["bbox"] [link] -> p["bbox"][2]
        line = re.sub(
            r'(\["bbox"\]|\[\'bbox\'\])\s*\[[^\]\n]+\]\([^\)\n]+\)',
            r"\1[2]",
            line,
        )

        # 3. 特定関節のタプル代入
        # 腰関節 (kpts[11], kpts[12])
        line = re.sub(
            r"(l_hip\s*,\s*r_hip\s*=\s*)kpts\s*\[[^\]\n]+\]\([^\)\n]+\)\s*,\s*kpts\s*\[[^\]\n]+\]\([^\)\n]+\)",
            r"\1kpts[11], kpts[12]",
            line,
        )

        # 肩関節 (kpts[5], kpts[6])
        line = re.sub(
            r"(l_sh\s*,\s*r_sh\s*=\s*|l_shoulder\s*,\s*r_shoulder\s*=\s*)kpts\s*\[[^\]\n]+\]\([^\)\n]+\)\s*,\s*kpts\s*\[[^\]\n]+\]\([^\)\n]+\)",
            r"\1kpts[5], kpts[6]",
            line,
        )
        line = re.sub(
            r"\bkpts\s*\[[^\]\n]+\]\([^\)\n]+\)\s*,\s*kpts(?:\[6\]|\s*\[[^\]\n]+\]\([^\)\n]+\))",
            r"kpts[5], kpts[6]",
            line,
        )

        # 手首関節 (kpts[9], kpts[10])
        line = re.sub(
            r"(l_wrist\s*,\s*r_wrist\s*=\s*)kpts\s*\[[^\]\n]+\]\([^\)\n]+\)\s*,\s*kpts\s*\[[^\]\n]+\]\([^\)\n]+\)",
            r"\1kpts[9], kpts[10]",
            line,
        )

        # 4. 信頼度・スコア比較 (閾値比較) -> 必ず [2] (confidence)
        # float(expr [link]) > 0.3 / < 0.3
        line = re.sub(
            r"(float\s*\(\s*[\w\.\[\]\"\'_]+)\s*\[[^\]\n]+\]\([^\)\n]+\)(\s*\)\s*[><]=?\s*0\.\d+)",
            r"\1[2]\2",
            line,
        )
        # expr [link] > 0.3 / < 0.3
        line = re.sub(
            r"([\w\.\[\]\"\'_]+)\s*\[[^\]\n]+\]\([^\)\n]+\)(\s*[><]=?\s*0\.\d+)",
            r"\1[2]\2",
            line,
        )

        # 5. y座標アクセス (min/max, + offset, or int/float casting) -> 必ず [1] (y座標)
        line = re.sub(
            r"(left_sh|right_sh|l_sh|r_sh|l_hip|r_hip|pt|nose)\s*\[[^\]\n]+\]\([^\)\n]+\)(\s*[\+\-\,\)])",
            r"\1[1]\2",
            line,
        )
        line = re.sub(
            r"(int|float)\s*\(\s*([\w\.\[\]\"\'_]+)\s*\[[^\]\n]+\]\([^\)\n]+\)\s*\)",
            r"\1(\2[1])",
            line,
        )

        # 6. 残りの一般的な Markdown リンクを除去
        line = re.sub(r"\s*\[[^\]\n]+\]\([^\)\n]+\)", "", line)

        cleaned_lines.append(line)

    result = "\n".join(cleaned_lines)
    if code_text.endswith("\n"):
        result += "\n"
    return result


def parse_markdown(md_text: str, base_dir: Path) -> List[ExtractedFile]:
    lines = md_text.splitlines()
    in_code_block = False
    code_fence = ""
    current_code_lines = []
    current_lang = ""
    current_candidate_path: Optional[str] = None
    extracted: List[ExtractedFile] = []

    for line in lines:
        fence_match = re.match(r"^([`~]{3,})(.*)$", line)
        if fence_match:
            fence = fence_match.group(1)
            info = fence_match.group(2).strip()
            if not in_code_block:
                in_code_block = True
                code_fence = fence
                current_lang = info.split()[0] if info else ""
                current_code_lines = []
                info_path = extract_filepath_from_code_info(info)
                if info_path:
                    current_candidate_path = info_path
            else:
                if line.startswith(code_fence):
                    in_code_block = False
                    raw_code_text = (
                        "\n".join(current_code_lines)
                        + ("\n" if current_code_lines else "")
                    )
                    code_text = sanitize_code_content(raw_code_text)
                    if current_candidate_path:
                        item = ExtractedFile(
                            current_candidate_path, code_text, current_lang
                        )
                        item.check_existing(base_dir)
                        extracted.append(item)
                        current_candidate_path = None
                else:
                    current_code_lines.append(line)
            continue

        if in_code_block:
            current_code_lines.append(line)
        else:
            if re.match(r"^#{1,6}\s+", line):
                fp = extract_filepath_from_line(line, is_heading=True)
                if fp:
                    current_candidate_path = fp
                else:
                    # Non-filepath heading clears prior candidate
                    current_candidate_path = None
            else:
                fp = extract_filepath_from_line(line, is_heading=False)
                if fp and not current_candidate_path:
                    current_candidate_path = fp

    return extracted


class TUIApp:
    def __init__(
        self,
        files: List[ExtractedFile],
        source_name: str,
        base_dir: Path,
    ):
        self.files = files
        self.source_name = source_name
        self.base_dir = base_dir.resolve()
        self.cursor_idx = 0
        self.list_scroll = 0
        self.preview_scroll = 0
        self.status_msg = "Ready. [Space/Enter] でトグルして次へ、[w] で書き込み実行。"
        self.msg_is_error = False

    def run(self):
        curses.wrapper(self._main_loop)

    def _init_colors(self):
        curses.start_color()
        curses.use_default_colors()
        try:
            curses.curs_set(0)
        except Exception:
            pass

        # Color pair definitions
        # 1: Title/Header
        curses.init_pair(1, curses.COLOR_WHITE, curses.COLOR_BLUE)
        # 2: Selected cursor line
        curses.init_pair(2, curses.COLOR_BLACK, curses.COLOR_CYAN)
        # 3: Status NEW
        curses.init_pair(3, curses.COLOR_GREEN, -1)
        # 4: Status OVERWRITE
        curses.init_pair(4, curses.COLOR_YELLOW, -1)
        # 5: Status IDENTICAL
        curses.init_pair(5, curses.COLOR_BLUE, -1)
        # 6: Checkbox checked [x]
        curses.init_pair(6, curses.COLOR_GREEN, -1)
        # 7: Key bindings / highlight
        curses.init_pair(7, curses.COLOR_CYAN, -1)
        # 8: Status error
        curses.init_pair(8, curses.COLOR_RED, -1)
        # 9: Preview title bar
        curses.init_pair(9, curses.COLOR_BLACK, curses.COLOR_WHITE)

    def _safe_addstr(self, win, y: int, x: int, text: str, attr=0):
        max_y, max_x = win.getmaxyx()
        if y < 0 or y >= max_y or x < 0 or x >= max_x:
            return
        avail_width = max_x - x
        # If at bottom-most line, avoid bottom-right corner cell to prevent curses scroll ERR
        if y == max_y - 1:
            avail_width = max(0, avail_width - 1)
        truncated = truncate_str(text, avail_width, "")
        try:
            win.addstr(y, x, truncated, attr)
        except curses.error:
            pass

    def _draw(self, stdscr):
        stdscr.erase()
        h, w = stdscr.getmaxyx()

        if h < 12 or w < 50:
            self._safe_addstr(
                stdscr,
                0,
                0,
                f"Terminal too small ({w}x{h}). Needs at least 50x12.",
                curses.color_pair(8),
            )
            stdscr.refresh()
            return

        # 1. Header (2 lines)
        title = f" Markdown File Extractor & Writer | Source: {self.source_name} | Target: {self.base_dir} "
        self._safe_addstr(stdscr, 0, 0, " " * (w - 1), curses.color_pair(1))
        self._safe_addstr(stdscr, 0, 0, title, curses.color_pair(1) | curses.A_BOLD)

        sel_count = sum(1 for f in self.files if f.selected)
        new_count = sum(1 for f in self.files if f.status == "NEW")
        ovw_count = sum(1 for f in self.files if f.status == "OVERWRITE")
        idn_count = sum(1 for f in self.files if f.status == "IDENTICAL")

        stats = (
            f" Total: {len(self.files)} files | Selected: {sel_count} "
            f"([NEW]: {new_count}, [OVERWRITE]: {ovw_count}, [IDENTICAL]: {idn_count})"
        )
        self._safe_addstr(stdscr, 1, 0, stats, curses.A_DIM)

        # Layout division
        footer_height = 2
        header_height = 2
        avail_body = h - header_height - footer_height

        list_height = max(4, min(avail_body // 2, len(self.files) + 1))
        preview_header_y = header_height + list_height
        preview_y = preview_header_y + 1
        preview_height = max(1, h - footer_height - preview_y)

        # 2. File list rendering
        if self.cursor_idx < self.list_scroll:
            self.list_scroll = self.cursor_idx
        elif self.cursor_idx >= self.list_scroll + list_height:
            self.list_scroll = self.cursor_idx - list_height + 1

        for i in range(list_height):
            item_idx = self.list_scroll + i
            y = header_height + i
            if item_idx >= len(self.files):
                break

            f = self.files[item_idx]
            is_cursor = (item_idx == self.cursor_idx)

            # Checkbox
            chk = "[x]" if f.selected else "[ ]"
            # Status badge
            if f.status == "NEW":
                badge = "[NEW]      "
                badge_attr = curses.color_pair(3) | curses.A_BOLD
            elif f.status == "OVERWRITE":
                badge = "[OVERWRITE]"
                badge_attr = curses.color_pair(4) | curses.A_BOLD
            else:
                badge = "[IDENTICAL]"
                badge_attr = curses.color_pair(5)

            # Sizes
            size_str = format_size(f.new_size)
            if f.existing_size is not None and f.status == "OVERWRITE":
                size_str += f" (disk: {format_size(f.existing_size)})"

            prefix = "> " if is_cursor else "  "
            line_str = f"{prefix}{chk} {badge} {f.rel_path}"

            if is_cursor:
                self._safe_addstr(stdscr, y, 0, " " * (w - 1), curses.color_pair(2))
                self._safe_addstr(stdscr, y, 0, line_str, curses.color_pair(2) | curses.A_BOLD)
                self._safe_addstr(stdscr, y, max(0, w - len(size_str) - 2), size_str, curses.color_pair(2) | curses.A_BOLD)
            else:
                self._safe_addstr(stdscr, y, 0, prefix)
                chk_color = (
                    curses.color_pair(6) | curses.A_BOLD
                    if f.selected
                    else curses.A_DIM
                )
                self._safe_addstr(stdscr, y, 2, chk, chk_color)
                self._safe_addstr(stdscr, y, 6, badge, badge_attr)
                path_str = f" {f.rel_path}"
                avail_path_w = max(10, w - len(size_str) - 20)
                path_str = truncate_str(path_str, avail_path_w)
                self._safe_addstr(stdscr, y, 17, path_str)
                self._safe_addstr(
                    stdscr, y, max(0, w - len(size_str) - 2), size_str, curses.A_DIM
                )

        # 3. Preview header
        cur_file = self.files[self.cursor_idx] if self.files else None
        p_title = " Preview "
        if cur_file:
            num_lines = len(cur_file.content_lines)
            scroll_info = (
                f"Line {self.preview_scroll + 1}/{max(1, num_lines)}"
            )
            p_title = (
                f" Preview: {cur_file.rel_path} ({scroll_info}, "
                f"{cur_file.lang or 'text'}) [PgUp/PgDn: scroll] "
            )

        self._safe_addstr(stdscr, preview_header_y, 0, " " * (w - 1), curses.color_pair(9))
        self._safe_addstr(stdscr, preview_header_y, 0, p_title, curses.color_pair(9))

        # 4. Preview content
        if cur_file:
            for pi in range(preview_height):
                py = preview_y + pi
                line_idx = self.preview_scroll + pi
                if line_idx < len(cur_file.content_lines):
                    code_line = cur_file.content_lines[line_idx]
                    ln_prefix = f"{line_idx + 1:4d} | "
                    self._safe_addstr(stdscr, py, 0, ln_prefix, curses.A_DIM)
                    self._safe_addstr(
                        stdscr,
                        py,
                        len(ln_prefix),
                        code_line.replace("\t", "    "),
                    )
                else:
                    self._safe_addstr(stdscr, py, 0, "~", curses.A_DIM)

        # 5. Footer (Status message + Help key bar)
        msg_y = h - 2
        help_y = h - 1

        msg_attr = (
            curses.color_pair(8) | curses.A_BOLD
            if self.msg_is_error
            else curses.color_pair(7)
        )
        self._safe_addstr(stdscr, msg_y, 0, " Status: " + self.status_msg, msg_attr)

        help_keys = [
            ("[Space/Enter]", "Toggle & Next"),
            ("[a]", "All"),
            ("[o]", "Overwrite"),
            ("[n]", "New"),
            ("[PgUp/Dn]", "Scroll"),
            ("[w]", "Write!"),
            ("[q]", "Quit"),
        ]
        help_text = " " + "  ".join(f"{k} {desc}" for k, desc in help_keys)
        self._safe_addstr(stdscr, help_y, 0, " " * (w - 1), curses.A_REVERSE)
        self._safe_addstr(stdscr, help_y, 0, help_text, curses.A_REVERSE)

        stdscr.refresh()

    def _confirm_write(self, stdscr) -> bool:
        selected_files = [f for f in self.files if f.selected]
        if not selected_files:
            self.status_msg = "書き込み対象が選択されていません。"
            self.msg_is_error = True
            return False

        h, w = stdscr.getmaxyx()
        box_w = min(64, w - 4)
        box_h = 7
        box_y = max(1, (h - box_h) // 2)
        box_x = max(1, (w - box_w) // 2)

        win = curses.newwin(box_h, box_w, box_y, box_x)
        win.box()
        win.bkgd(" ", curses.color_pair(1))

        self._safe_addstr(
            win, 1, 2, "★ ファイル書き込み確認", curses.A_BOLD
        )
        self._safe_addstr(
            win,
            2,
            2,
            f"選択された {len(selected_files)} 個のファイルを書き込みますか？",
        )
        self._safe_addstr(
            win, 3, 2, f"書き込み先: {self.base_dir}", curses.A_DIM
        )
        self._safe_addstr(
            win,
            5,
            2,
            "[ y ] 書き込み実行   /   [ n / Esc ] キャンセル",
            curses.A_BOLD,
        )
        win.refresh()

        while True:
            key = win.getch()
            if key in [ord("y"), ord("Y")]:
                return True
            elif key in [ord("n"), ord("N"), 27, ord("q")]:
                return False

    def _execute_write(self):
        selected_files = [f for f in self.files if f.selected]
        success_count = 0
        fail_count = 0
        err_msg = ""

        for f in selected_files:
            ok, msg = f.write_to_disk(self.base_dir)
            if ok:
                success_count += 1
            else:
                fail_count += 1
                err_msg = msg

        if fail_count == 0:
            self.status_msg = f"★ 成功: {success_count} 件のファイルを正常に書き込みました！"
            self.msg_is_error = False
        else:
            self.status_msg = f"一部失敗 ({success_count} 成功, {fail_count} 失敗): {err_msg}"
            self.msg_is_error = True

    def _main_loop(self, stdscr):
        self._init_colors()
        stdscr.keypad(True)

        while True:
            self._draw(stdscr)
            try:
                ch = stdscr.getch()
            except KeyboardInterrupt:
                break

            if ch == curses.KEY_RESIZE:
                continue

            # Quit
            if ch in [ord("q"), ord("Q")]:
                break

            # Navigation
            elif ch in [curses.KEY_UP, ord("k")]:
                if self.cursor_idx > 0:
                    self.cursor_idx -= 1
                    self.preview_scroll = 0

            elif ch in [curses.KEY_DOWN, ord("j")]:
                if self.cursor_idx < len(self.files) - 1:
                    self.cursor_idx += 1
                    self.preview_scroll = 0

            # Toggle selection & advance to next item
            elif ch in [ord(" "), curses.KEY_ENTER, 10, 13]:
                if self.files:
                    f = self.files[self.cursor_idx]
                    f.selected = not f.selected
                    act = "選択" if f.selected else "解除"
                    self.status_msg = f"{f.rel_path} を {act} しました。"
                    self.msg_is_error = False
                    # 次のファイルに進む
                    if self.cursor_idx < len(self.files) - 1:
                        self.cursor_idx += 1
                        self.preview_scroll = 0

            # Select/Deselect All
            elif ch in [ord("a"), ord("A")]:
                all_selected = all(f.selected for f in self.files)
                for f in self.files:
                    f.selected = not all_selected
                state_str = "全解除" if all_selected else "全選択"
                self.status_msg = f"すべてのファイルを{state_str}しました。"
                self.msg_is_error = False

            # Select only Overwrite
            elif ch in [ord("o"), ord("O")]:
                for f in self.files:
                    f.selected = (f.status == "OVERWRITE")
                self.status_msg = "上書き対象のみを選択しました。"
                self.msg_is_error = False

            # Select only New
            elif ch in [ord("n"), ord("N")]:
                for f in self.files:
                    f.selected = (f.status == "NEW")
                self.status_msg = "新規作成ファイルのみを選択しました。"
                self.msg_is_error = False

            # Preview scroll
            elif ch in [curses.KEY_NPAGE, ord("]")]:  # Page Down
                if self.files:
                    cur_f = self.files[self.cursor_idx]
                    self.preview_scroll = min(
                        len(cur_f.content_lines) - 1, self.preview_scroll + 10
                    )
            elif ch in [curses.KEY_PPAGE, ord("[")]:  # Page Up
                self.preview_scroll = max(0, self.preview_scroll - 10)

            # Write trigger
            elif ch in [ord("w"), ord("W")]:
                if self._confirm_write(stdscr):
                    self._execute_write()
                else:
                    self.status_msg = "書き込みをキャンセルしました。"
                    self.msg_is_error = False


def cli_list(files: List[ExtractedFile]):
    print(f"抽出結果: 合計 {len(files)} 件のファイル")
    print("-" * 75)
    print(f"{'状態':12} {'サイズ':12} {'ファイルパス'}")
    print("-" * 75)
    for f in files:
        size_str = format_size(f.new_size)
        if f.status == "OVERWRITE" and f.existing_size is not None:
            size_str += f" (現: {format_size(f.existing_size)})"
        print(f"[{f.status:9}] {size_str:18} {f.rel_path}")
    print("-" * 75)


def cli_write_all(files: List[ExtractedFile], base_dir: Path):
    print(f"書き込み先: {base_dir.resolve()}")
    success_count = 0
    fail_count = 0
    for f in files:
        ok, msg = f.write_to_disk(base_dir)
        if ok:
            print(f"[OK] {f.rel_path} ({format_size(f.new_size)})")
            success_count += 1
        else:
            print(f"[ERROR] {msg}")
            fail_count += 1
    print(f"\n完了: {success_count} 成功, {fail_count} 失敗")


def find_default_markdown() -> Optional[Path]:
    if Path("tmp.md").is_file():
        return Path("tmp.md")
    md_files = list(Path(".").glob("*.md"))
    if md_files:
        return md_files[0]
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Markdown からソースコードとファイル名を抽出して書き込む TUI ツール",
    )
    parser.add_argument(
        "markdown_file",
        nargs="?",
        default=None,
        help="対象の Markdown ファイル (省略時は tmp.md またはカレントディレクトリの .md)",
    )
    parser.add_argument(
        "-d",
        "--dir",
        dest="target_dir",
        default=".",
        help="ファイルの書き込み先ディレクトリ (デフォルト: カレントディレクトリ)",
    )
    parser.add_argument(
        "-l",
        "--list",
        action="store_true",
        help="TUI を起動せず、抽出されたファイル一覧を表示して終了",
    )
    parser.add_argument(
        "-y",
        "--yes",
        "--all",
        action="store_true",
        help="TUI を起動せず、抽出された全ファイルを直ちに書き込み",
    )

    args = parser.parse_args()

    md_path_str = args.markdown_file
    if md_path_str:
        md_path = Path(md_path_str)
    else:
        md_path = find_default_markdown()

    if not md_path or not md_path.is_file():
        sys.stderr.write(
            f"エラー: 対象の Markdown ファイルが見つかりません: {md_path_str or '(自動検出失敗)'}\n"
        )
        sys.exit(1)

    try:
        content = md_path.read_text(encoding="utf-8")
    except Exception as e:
        sys.stderr.write(f"Markdown 読み込みエラー ({md_path}): {e}\n")
        sys.exit(1)

    base_dir = Path(args.target_dir)
    extracted = parse_markdown(content, base_dir)

    if not extracted:
        print(f"指定された Markdown ({md_path}) からファイルは検出されませんでした。")
        sys.exit(0)

    # CLI modes
    if args.list:
        cli_list(extracted)
        sys.exit(0)

    if args.yes:
        cli_write_all(extracted, base_dir)
        sys.exit(0)

    # Interactive TUI mode
    # Check if stdout is a tty
    if not sys.stdout.isatty():
        print("警告: 端末 (TTY) が検出されませんでした。一覧を表示します。")
        print("(全書き込みを実行する場合は --yes / -y オプションを指定してください)\n")
        cli_list(extracted)
        sys.exit(0)

    app = TUIApp(extracted, str(md_path), base_dir)
    app.run()


if __name__ == "__main__":
    main()
```

##
