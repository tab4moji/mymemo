## Google Colab を便利にしたい

### 俺が考えた最強の起動

```python
from google.colab import drive
drive.mount('/content/drive')
```

```bash
cat << 'EOF' > /content/drive/MyDrive/colab_works/init.sh
#!/bin/bash
# 003 2026-04-06
# 目的: Colab環境の永続化初期化、自動記録、および終了時のフック処理

WORK_DIR="/content/drive/MyDrive/colab_works"
REQ_FILE="$WORK_DIR/my_packages.txt"
CACHE_DIR="$WORK_DIR/pip_cache"

# ~/myworks のシンボリックリンク
if [ ! -L ~/myworks ]; then
  ln -s "$WORK_DIR" ~/myworks
fi

# 起動時の復元処理
if [ -f "$REQ_FILE" ]; then
  echo "Restoring packages from $REQ_FILE..."
  python3 -m pip install -r "$REQ_FILE" --cache-dir "$CACHE_DIR" --disable-pip-version-check -q
fi

# パッケージインストールと記録を同時に行う関数
pipi() {
  local res=0
  if [ -z "$1" ]; then
    echo "Error: Usage: pipi <package_name>..." >&2
    res=1
  else
    python3 -m pip install "$@"
    if [ $? -ne 0 ]; then
      echo "Error: Failed to install packages." >&2
      res=1
    else
      for pkg in "$@"; do
        if ! grep -i -q -w "$pkg" "$REQ_FILE" 2>/dev/null; then
          echo "$pkg" >> "$REQ_FILE"
          echo "=> Added $pkg to $REQ_FILE"
        fi
      done
    fi
  fi
  return $res
}

# ---------------------------------------------
# 終了時 (exit / CTRL-D) に自動実行される関数
# ---------------------------------------------
on_exit() {
  echo ""
  echo "Terminating workspace..."
  # ★ここに終了時に自動でやりたい処理を書く★
  # （例: Gitの自動コミットや、特定の作業ログのDriveへの退避など）
  
  echo "Done. お疲れ！"
}

# bashが終了するシグナル (EXIT) を検知したら on_exit を実行するよう設定
trap on_exit EXIT

cd ~/myworks
echo "Workspace ready!"
echo "終了時は exit か CTRL-D で on_exit処理 が走るぞ。"
EOF
```
