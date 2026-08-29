## Ollama

### 概要

- [Ollama documentation](https://docs.ollama.com/)
- [CLI Reference](https://docs.ollama.com/cli)

- [Hugging Face 流行モデル](https://huggingface.co/models?library=gguf&apps=ollama&inference_provider=all&sort=trending)

### ollama コマンド

#### コマンド一覧

```text
Large language model runner

Usage:
  ollama [flags]
  ollama [command]

Available Commands:
  serve        Start Ollama
  create       Create a model
  show         Show information for a model
  run          Run a model
  stop         Stop a running model
  pull         Pull a model from a registry
  push         Push a model to a registry
  signin       Sign in to ollama.com
  signout      Sign out from ollama.com
  list         List models
  ps           List running models
  cp           Copy a model
  rm           Remove a model
  launch       Launch the Ollama menu or an integration
  help         Help about any command

Flags:
  -h, --help         help for ollama
      --nowordwrap   Don't wrap words to the next line automatically
      --verbose      Show timings for response
  -v, --version      Show version information

Use "ollama [command] --help" for more information about a command.
```

#### コマンド使用例

ollama ツールバージョン

```shell:バージョン表示
ollama --version
```

取得済みモデル一覧

```shell:モデル一覧表示
ollama list
```

ollama コマンド一覧

```shell:ヘルプ表示
ollama --help
```

```shell:モデルダウンロード
ollama pull hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS
```

### モデル使用例

- [unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/blob/main/Qwen3.8-27B-UD-IQ4_XS.gguf)

```shell:モデルダウンロード(省略可能)
ollama pull hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS
```

```shell:初回起動
ollama run hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS
```

```shell:モデルの設定開始
/set parameter num_ctx 32768
/save *qwen38-27b-32k*
/bye
```

```shell:設定済みのモデルを起動
ollama run qwen38-27b-32k
```

### ollama 起動

iGPU で起動

```powershell:iGPUでollama
# 1. 既存プロセス停止
# Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force

$env:HSA_OVERRIDE_GFX_VERSION = ""
$env:OLLAMA_IGPU_ENABLE = ""
$env:ROCR_VISIBLE_DEVICES = ""
$env:ROCm_VISIBLE_DEVICES = ""
$env:HIP_VISIBLE_DEVICES = ""
$env:GGML_VK_VISIBLE_DEVICES = ""
$env:OLLAMA_VULKAN = "false"
$env:OLLAMA_NUM_CTX = 32768
$env:OLLAMA_KEEP_ALIVE = "-1"

# 2. 環境変数を明示
$env:OLLAMA_HOST = "0.0.0.0:11435" # XXX EmbeddingGemma
$env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"

$env:OLLAMA_VULKAN = "true"
$env:OLLAMA_IGPU_ENABLE = "1"
$env:GGML_VK_VISIBLE_DEVICES = "0"
$env:ROCR_VISIBLE_DEVICES = "1"

# 3. 起動
ollama serve
```

dGPU(eGPU) で起動

```powershell:dGPU(eGPU)でollama
# 1. 既存プロセス停止
# Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force

$env:HSA_OVERRIDE_GFX_VERSION = ""
$env:OLLAMA_IGPU_ENABLE = ""
$env:ROCR_VISIBLE_DEVICES = ""
$env:ROCm_VISIBLE_DEVICES = ""
$env:HIP_VISIBLE_DEVICES = ""
$env:GGML_VK_VISIBLE_DEVICES = ""
$env:OLLAMA_VULKAN = "false"
$env:OLLAMA_NUM_CTX = 32768
$env:OLLAMA_KEEP_ALIVE = "-1"

# 2. 環境変数を明示
$env:OLLAMA_HOST = "0.0.0.0:11435" # XXX EmbeddingGemma
$env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"

$env:OLLAMA_VULKAN = "true"
$env:OLLAMA_IGPU_ENABLE = "1"
$env:GGML_VK_VISIBLE_DEVICES = "0"
$env:ROCR_VISIBLE_DEVICES = "1"

# 3. 起動
ollama serve
```

### ollama_chat.py

**ollama_chat.py**: チャットクライアントのソースコード。**プロキシ無効**。

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Ollama/OpenAI-Compatible Chat Client (Standard Libs Only)
Purpose: Universal chat client handling both Ollama and OpenAI formats with proxy bypass.
"""

import json
import sys
import time
import os
from urllib import request, error
from datetime import datetime

# --- Configuration (ここを環境に合わせて書き換える) ---
# 例: 社内サーバがOpenAI互換なら http://server:8000/v1/chat/completions など
API_URL = "http://localhost:11434/api/chat" 
API_KEY = "sk-your-key-here"  # 正しいキーを入れる
MODEL_NAME = "llama3"         # サーバに入っているモデル名
USER_NAME = "太郎"
TIMEOUT_SEC = 60

def setup_proxy_bypass():
    """
    プロキシを強制的に無効化する設定
    """
    # 1. urllibのハンドラでプロキシを使用しない設定にする
    proxy_handler = request.ProxyHandler({})
    opener = request.build_opener(proxy_handler)
    request.install_opener(opener)

    # 2. 環境変数でも念押しで無効化 (WSL2や社内LANでのトラブル防止)
    for env_var in ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"]:
        if env_var in os.environ:
            del os.environ[env_var]
    
    os.environ["no_proxy"] = "*"
    os.environ["NO_PROXY"] = "*"

def send_chat_request(messages: list) -> str:
    """
    Ollama または OpenAI互換API にリクエストを送り、レスポンスを逐次表示する。
    """
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True
        # "max_tokens": 1024 # 必要なら有効化
    }
    
    data = json.dumps(payload).encode("utf-8")
    
    # ヘッダー設定 (Bearer Token認証)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY.strip()}"
    }

    req = request.Request(API_URL, data=data, headers=headers)
    full_content = []

    try:
        with request.urlopen(req, timeout=TIMEOUT_SEC) as response:
            print(f"Assistant ({MODEL_NAME}): ", end="", flush=True)
            
            for line in response:
                if not line:
                    continue
                
                try:
                    line_str = line.decode("utf-8").strip()
                    if not line_str:
                        continue

                    # --- SSE (Server-Sent Events) 対応 ---
                    # OpenAI互換形式の場合、行頭に "data: " がつくので削除
                    if line_str.startswith("data: "):
                        line_str = line_str[6:]
                    
                    # ストリーム終了シグナル
                    if line_str == "[DONE]":
                        break
                    
                    # JSONパース
                    try:
                        json_obj = json.loads(line_str)
                    except json.JSONDecodeError:
                        # JSONじゃない行（ただのpingなど）は無視
                        continue

                    chunk = ""

                    # パターンA: OpenAI互換 (choices -> delta -> content)
                    if "choices" in json_obj and len(json_obj["choices"]) > 0:
                        delta = json_obj["choices"][0].get("delta", {})
                        chunk = delta.get("content", "")
                        
                    # パターンB: Ollama純正 (message -> content)
                    elif "message" in json_obj:
                        if not json_obj.get("done"):
                            chunk = json_obj.get("message", {}).get("content", "")

                    # 画面出力とバッファへの追加
                    if chunk:
                        print(chunk, end="", flush=True)
                        full_content.append(chunk)

                except Exception:
                    continue

            print("\n" + "-" * 40 + "\n")

    except error.HTTPError as e:
        print(f"\n[HTTP Error] Status: {e.code} Reason: {e.reason}", file=sys.stderr)
        print(f"[Hint] 401=Key/Header error, 404=Model/URL error, 405=Bad Method(URL check needed)", file=sys.stderr)
        full_content = [f"Error: HTTP {e.code}"]

    except error.URLError as e:
        print(f"\n[Connection Error] {e}", file=sys.stderr)
        full_content = ["Error: Connection failed."]

    except Exception as e:
        print(f"\n[Error] Unexpected: {e}", file=sys.stderr)
        full_content = ["Error: Unexpected error."]

    return "".join(full_content)

def main() -> None:
    # プロキシ回避の初期化
    setup_proxy_bypass()

    print(f"--- Starting Session with {MODEL_NAME} ---")
    print(f"Target URL: {API_URL}")
    print(f"Time: {datetime.now().strftime('%H:%M:%S')}\n")

    history = []

    # 1. 自己紹介
    user_input_1 = f"こんにちは、{USER_NAME}です。手短に挨拶してください。"
    print(f"User: {user_input_1}")
    history.append({"role": "user", "content": user_input_1})
    
    response_1 = send_chat_request(history)
    history.append({"role": "assistant", "content": response_1})

    # Wait
    time.sleep(1)

    # 2. 会話継続
    user_input_2 = "今、私が名乗った名前を覚えていますか？"
    print(f"User: {user_input_2}")
    history.append({"role": "user", "content": user_input_2})
    
    response_2 = send_chat_request(history)
    history.append({"role": "assistant", "content": response_2})

    print("--- Session Ended ---")

if __name__ == "__main__":
    main()
```

```powershell
sudo "$(wslpath -u "$(powershell "where.exe pwsh" | sed -E "/^$/d" | iconv -t utf-8 | tail -1)")" -ExecutionPolicy Bypass -File $(wslpath -w ~/myworks/ollama/start.ps1)
```

### メモ

- [Windows の GPU チェック](./?content=wsl#kWBqiW0y)

##
