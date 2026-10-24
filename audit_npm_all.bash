#!/usr/bin/env bash
# 目的: 全 npm プロジェクトおよびグローバル環境の一括脆弱性監査（ENOLOCK対策版）
# 更新履歴: Rev 001 (2026-10-24) 新規作成
#           Rev 002 (2026-10-24) グローバル領域の監査を OSV 直結方式へ刷新

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="${SCRIPT_DIR}/npm_audit_engine.py"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm command not found." >&2
  exit 1
fi

FD_CMD="fd"
if command -v fdfind >/dev/null 2>&1; then
  FD_CMD="fdfind"
elif ! command -v fd >/dev/null 2>&1; then
  echo "Error: Neither fd nor fdfind is installed." >&2
  exit 1
fi

echo "=== Cleaning npm cache ==="
npm cache clean --force >/dev/null 2>&1 || true

echo ""
echo "=================================================="
echo " 1. Auditing Local Projects (package.json)"
echo "=================================================="

PROJECTS=$($FD_CMD -H -I -t f '^package\.json$' "$HOME" \
  -E 'node_modules' \
  -E '.cache' \
  -E '.local' \
  -E '.git' \
  --prune \
  --exec dirname {})

if [[ -z "$PROJECTS" ]]; then
  echo "(No npm projects found)"
else
  for proj in $PROJECTS; do
    echo "Directory: $proj"
    if [[ -f "$proj/package-lock.json" ]]; then
      (cd "$proj" && npm audit --omit=dev 2>&1) || true
    elif [[ -f "$ENGINE" ]] && command -v python3 >/dev/null 2>&1; then
      python3 "$ENGINE" "$proj/package.json" 2>&1 || true
    else
      echo "Notice: Missing package-lock.json and fallback engine unavailable." >&2
    fi
    echo ""
  done
fi

echo "=================================================="
echo " 2. Auditing Global NPM Packages (via OSV)"
echo "=================================================="

TMP_GLOBAL_PKG=$(mktemp)
node -e '
  const { execSync } = require("child_process");
  try {
    const data = JSON.parse(execSync("npm list -g --depth=0 --json").toString());
    const deps = {};
    for (const [k, v] of Object.entries(data.dependencies || {})) {
      deps[k] = v.version || "0.0.0";
    }
    console.log(JSON.stringify({ dependencies: deps }));
  } catch (e) {
    console.log(JSON.stringify({ dependencies: {} }));
  }
' > "$TMP_GLOBAL_PKG"

if [[ -s "$TMP_GLOBAL_PKG" && -f "$ENGINE" ]] && command -v python3 >/dev/null 2>&1; then
  python3 "$ENGINE" "$TMP_GLOBAL_PKG" 2>&1 || true
else
  echo "(No global npm packages detected)"
fi
rm -f "$TMP_GLOBAL_PKG"
echo ""

echo "=== Finalizing clean ==="
npm cache clean --force >/dev/null 2>&1 || true
echo "NPM audit complete."
