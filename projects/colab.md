## Google Colab を便利にしたい

### 俺が考えた最強の起動

```python
# 001 2026-04-06
# 目的: Driveのマウントと、Colabのuserdataから.envファイルを自動生成する機能

import os
from google.colab import drive
from google.colab import userdata

def create_env_file(env_path: str, secret_keys: list[str]) -> None:
    """userdataから指定されたキーを取得し、.envファイルに書き込む。"""
    try:
        with open(env_path, 'w') as f:
            for key in secret_keys:
                try:
                    # userdataから取得して書き込み
                    val = userdata.get(key)
                    f.write(f'{key}="{val}"\n')
                except userdata.SecretNotFoundError:
                    # シークレットが存在しない場合はスキップ
                    pass
    except IOError as e:
        print(f"Error: .envファイルの作成に失敗した。{e}")
        raise
    
    return None

def main() -> None:
    # 1. Driveをマウント（既にマウント済みの場合はスキップされる）
    drive.mount('/content/drive')
    
    # 2. .envファイルの保存先
    env_file_path = '/content/drive/MyDrive/colab_works/.env'
    
    # 3. .envに書き出したいColabシークレットのキー名をリストで指定
    keys_to_export = ['HF_TOKEN'] 
    
    # 4. .envを自動生成
    create_env_file(env_file_path, keys_to_export)
    print(f"✅ {env_file_path}")
    
    return None

if __name__ == "__main__":
    main()

print("""
source /content/drive/MyDrive/colab_works/init.sh
""")
```

```bash:init.sh
#!/bin/bash
# 007 2026-04-06
# 目的: Colab環境の永続化、バージョン固定保存、および .env ファイルの自動展開

WORK_DIR="/content/drive/MyDrive/colab_works"
REQ_FILE="$WORK_DIR/my_packages.txt"
CACHE_DIR="$WORK_DIR/pip_cache"
BASE_PKG_LIST="/tmp/pip_base_$$.txt"
ENV_FILE="$WORK_DIR/.env"

# ~/myworks のシンボリックリンク作成
if [ ! -L ~/myworks ]; then
  ln -s "$WORK_DIR" ~/myworks
fi

# 1. 起動時の復元処理
if [ -f "$REQ_FILE" ]; then
  echo "Restoring packages from $REQ_FILE..."
  python3 -m pip install -r "$REQ_FILE" --cache-dir "$CACHE_DIR" --disable-pip-version-check -q
fi

# 2. 復元直後のパッケージ一覧を記録
python3 -m pip freeze 2>/dev/null | grep '==' | tr '[:upper:]' '[:lower:]' | sort > "$BASE_PKG_LIST"

# 3. .env ファイルの展開（環境変数への読み込み）
# ガード節: ファイルが存在しなければスキップ
if [ -f "$ENV_FILE" ]; then
  # set -a (allexport): 以降に定義された変数を自動的にエクスポートする
  set -a
  source "$ENV_FILE"
  set +a
  echo "=> Loaded environment variables from .env"
fi

# ---------------------------------------------
# 差分パッケージを保存する関数
# ---------------------------------------------
save_env() {
  echo "Checking for unsaved packages..."
  local current_pkg_list="/tmp/pip_current_$$.txt"
  
  python3 -m pip freeze 2>/dev/null | grep '==' | tr '[:upper:]' '[:lower:]' | sort > "$current_pkg_list"
  local new_pkgs=$(comm -13 "$BASE_PKG_LIST" "$current_pkg_list")
  
  if [ -n "$new_pkgs" ]; then
    touch "$REQ_FILE"
    for pkg in $new_pkgs; do
      local pkg_name=$(echo "$pkg" | awk -F== '{print $1}')
      sed -i "/^${pkg_name}==/d" "$REQ_FILE" 2>/dev/null
      sed -i "/^${pkg_name}$/d" "$REQ_FILE" 2>/dev/null
      echo "$pkg" >> "$REQ_FILE"
      echo "=> Saved $pkg to $REQ_FILE"
    done
    mv "$current_pkg_list" "$BASE_PKG_LIST"
  else
    echo "No new packages to save."
    rm -f "$current_pkg_list"
  fi
}

# ---------------------------------------------
# 終了時フック
# ---------------------------------------------
on_exit() {
  echo ""
  echo "Terminating workspace..."
  save_env
  rm -f "$BASE_PKG_LIST"
  echo "Done. お疲れ！"
}

trap on_exit EXIT

cd ~/myworks
echo "Workspace ready! .env の内容も展開済みだ。"
```
