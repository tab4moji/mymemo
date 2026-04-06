## Google Colab を便利にしたい

### 俺が考えた最強の起動

```python
from google.colab import drive
drive.mount('/content/drive')

# source /content/drive/MyDrive/colab_works/init.sh
################################################################
```

```bash:init.sh
#!/bin/bash
# 005 2026-04-06
# 目的: Colab環境の永続化初期化、積極的save_envの再建と終了時の自動サルベージ必須化

WORK_DIR="/content/drive/MyDrive/colab_works"
REQ_FILE="$WORK_DIR/my_packages.txt"
CACHE_DIR="$WORK_DIR/pip_cache"
BASE_PKG_LIST="/tmp/pip_base_$$.txt"

# ~/myworks のシンボリックリンク作成
if [ ! -L ~/myworks ]; then
  ln -s "$WORK_DIR" ~/myworks
fi

# 1. 起動時の復元処理
if [ -f "$REQ_FILE" ]; then
  echo "Restoring packages from $REQ_FILE..."
  python3 -m pip install -r "$REQ_FILE" --cache-dir "$CACHE_DIR" --disable-pip-version-check -q
fi

# 2. 復元直後のパッケージ一覧を記録（初期ベースライン）
python3 -m pip list --format=freeze 2>/dev/null | awk -F= '{print $1}' | awk '{print $1}' | tr '[:upper:]' '[:lower:]' | sort > "$BASE_PKG_LIST"

# ---------------------------------------------
# 差分パッケージを手動でサルベージして保存する関数
# ---------------------------------------------
save_env() {
  echo "Checking for unsaved packages..."
  local current_pkg_list="/tmp/pip_current_$$.txt"
  
  # 現在のパッケージ一覧を取得
  python3 -m pip list --format=freeze 2>/dev/null | awk -F= '{print $1}' | awk '{print $1}' | tr '[:upper:]' '[:lower:]' | sort > "$current_pkg_list"
  
  # ベースラインとの差分を抽出
  local new_pkgs=$(comm -13 "$BASE_PKG_LIST" "$current_pkg_list")
  
  if [ -n "$new_pkgs" ]; then
    for pkg in $new_pkgs; do
      # -x オプションで完全一致検索し、重複登録を防ぐ
      if ! grep -i -q -x "$pkg" "$REQ_FILE" 2>/dev/null; then
        echo "$pkg" >> "$REQ_FILE"
        echo "=> Saved $pkg to $REQ_FILE"
      fi
    done
    # 次回の比較のために、ベースラインを現在の状態に更新する
    mv "$current_pkg_list" "$BASE_PKG_LIST"
  else
    echo "No new packages to save."
    rm -f "$current_pkg_list"
  fi
}

# ---------------------------------------------
# 終了時 (exit / CTRL-D) に自動実行されるフック
# ---------------------------------------------
on_exit() {
  echo ""
  echo "Terminating workspace..."
  # 終了時に必ず save_env を実行してサルベージ
  save_env
  
  # ゴミ掃除
  rm -f "$BASE_PKG_LIST"
  echo "Done. お疲れ！"
}

# bash終了シグナルで on_exit を必須実行
trap on_exit EXIT

cd ~/myworks
echo "Workspace ready!"
echo "任意のタイミングで 'save_env' を実行して差分保存できる。"
echo "ターミナル終了時にも自動で save_env が走るから安心だ。"
```
