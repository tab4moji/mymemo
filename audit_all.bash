#!/usr/bin/env bash
# 目的: 全 venv、uv tools、uv python、システム Python 環境の一括監査（完全標準版）
# 更新履歴: Rev 001 (2026-10-23) 新規作成
#           Rev 002 (2026-10-23) uv tool および uv 管理 Python の監査を追加
#           Rev 003 (2026-10-23) 各対象ディレクトリの明示表示および空結果の通知を追加
#           Rev 004 (2026-10-23) packaging 依存の事前チェックを削除

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="${SCRIPT_DIR}/audit_engine.py"

if [[ ! -f "$ENGINE" ]]; then
  echo "Error: audit_engine.py not found at $ENGINE" >&2
  exit 1
fi

FD_CMD="fd"
if command -v fdfind >/dev/null 2>&1; then
  FD_CMD="fdfind"
elif ! command -v fd >/dev/null 2>&1; then
  echo "Error: Neither fd nor fdfind is installed." >&2
  exit 1
fi

echo "=== Cleaning caches ==="
rm -rf "$HOME/.cache/pip" "$HOME/.cache/pip-audit"
if command -v uv >/dev/null 2>&1; then
  echo "clean..."
  uv cache clean >/dev/null 2>&1
fi

echo ""
echo "=================================================="
echo " 1. Auditing Virtual Environments (Project venvs)"
echo "=================================================="

VENVS=$($FD_CMD -H -I -t f '^pyvenv\.cfg$' "$HOME" \
  -E '.cache' \
  -E '.local' \
  -E '.git' \
  --prune \
  --exec dirname {})

if [[ -z "$VENVS" ]]; then
  echo "(No project virtual environments found)"
else
  for venv in $VENVS; do
    echo "Directory: $venv"
    py_bin="$venv/bin/python"
    if [[ -x "$py_bin" ]]; then
      "$py_bin" "$ENGINE" 2>&1 || true
    else
      echo "Notice: $py_bin not found or not executable" >&2
    fi
    echo ""
  done
fi

if command -v uv >/dev/null 2>&1; then
  echo "=================================================="
  echo " 2. Auditing uv Managed Tools & Pythons"
  echo "=================================================="

  UV_TOOL_DIR=$(uv tool dir 2>/dev/null || echo "$HOME/.local/share/uv/tools")
  UV_TOOL_VENVS=""
  if [[ -d "$UV_TOOL_DIR" ]]; then
    UV_TOOL_VENVS=$($FD_CMD -H -I -t f '^pyvenv\.cfg$' "$UV_TOOL_DIR" --prune --exec dirname {})
  fi

  if [[ -z "$UV_TOOL_VENVS" ]]; then
    echo "(No uv tools installed)"
  else
    for tool_env in $UV_TOOL_VENVS; do
      echo "Tool Directory: $tool_env"
      tool_py="$tool_env/bin/python"
      if [[ -x "$tool_py" ]]; then
        "$tool_py" "$ENGINE" 2>&1 || true
      else
        echo "Notice: $tool_py not found or not executable" >&2
      fi
      echo ""
    done
  fi

  UV_PY_DIR=$(uv python dir 2>/dev/null || echo "$HOME/.local/share/uv/python")
  UV_PYS=""
  if [[ -d "$UV_PY_DIR" ]]; then
    UV_PYS=$($FD_CMD -H -I -t f '^python3(\.[0-9]+)?$' "$UV_PY_DIR")
  fi

  if [[ -n "$UV_PYS" ]]; then
    for uv_py in $UV_PYS; do
      if [[ -x "$uv_py" ]]; then
        echo "uv Python Path: $uv_py"
        "$uv_py" "$ENGINE" 2>&1 || true
        echo ""
      fi
    done
  fi
fi

echo "=================================================="
echo " 3. Auditing System Python Interpreters"
echo "=================================================="

SYSTEM_PYS=$(compgen -c python | grep -E '^python3(\.[0-9]+)?(t)?$' | sort -u)

for py in $SYSTEM_PYS; do
  if command -v "$py" >/dev/null 2>&1; then
    py_path=$(which "$py")
    echo "System Path: $py_path"
    "$py" "$ENGINE" 2>&1 || true
    echo ""
  fi
done

echo "=== Finalizing clean ==="
if command -v uv >/dev/null 2>&1; then
  uv cache clean >/dev/null 2>&1
fi
echo "Audit complete."
