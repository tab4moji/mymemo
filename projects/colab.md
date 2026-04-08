## Google Colab を便利にしたい

### 俺が考えた最強の起動

```python:セルに書く
# @title
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


# @title
# セル1: 環境確認
import psutil, platform, os
print(f"RAM: {psutil.virtual_memory().total/1e9:.1f}GB")
print(f"Python: {platform.python_version()}")
print(f"CPU: {os.cpu_count()} cores")

try:
    import torch_xla
    print("XLA: available")
except:
    print("XLA: not available")

%reset -f
counter = 1
print("gc: .", end = "")
while True:
  import gc
  import time
  gc.collect() # Colab 新セルで実行
  try:
    import torch
    torch.cuda.empty_cache() # torch キャッシュを解放
  except:
    pass
  gc.collect() # Colab 新セルで実行
  if counter % 2 == 0:
    print(".", end = "")
  else:
    print("+", end = "")
  counter += 1
  time.sleep(5)
```

```bash:init.sh
#!/bin/bash
# 009 2026-04-07
# 目的: uvを利用した超高速化とGoogle Drive I/Oの削減

WORK_DIR="/content/drive/MyDrive/colab_works"

ln -s "${WORK_DIR}" ~/myworks

# ---------------------------------------------
# 終了時フック
# ---------------------------------------------
on_exit() {
  echo ""
  echo "Terminating workspace..."
  echo "Done. お疲れ！"
}

trap on_exit EXIT

cd ~/myworks
echo "Workspace ready! uvによる超高速モードだ。"
```

```bash:setup_litert.sh
#!/bin/bash

set -e

if true
then
    uv pip install --no-deps litert-torch
    uv pip install -U transformers "tf-nightly" "litert-torch-nightly" "torch>=2.11.0" --system --reinstall
    uv pip install --force-reinstall torchvision

    find /usr/local/lib/python3.12/dist-packages/litert_torch -name "*.py" | grep -i export | sort | grep gemma4
fi

echo "Run:"
echo "litert-torch export_hf ./local_gemma_model ./gemma4_output --task=text_generation --quantization_recipe="weight_only_wi4_afp32" --prefill_lengths="[512]" --cache_length=512 --bundle_litert_lm=True --experimental_lightweight_conversion=True --externalize_embedder"
```

```bash
litert-torch export_hf ./local_gemma_model ./gemma4_output --task=text_generation --quantization_recipe="weight_only_wi4_afp32" --prefill_lengths="[512]" --cache_length=512 --bundle_litert_lm=True --experimental_lightweight_conversion=True --externalize_embedder
```
