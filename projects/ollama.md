OllamaのAPIに対し、標準ライブラリのみを使ってストリーミングチャットを行うPythonスクリプトだ。
依存ライブラリなしですぐに動くよう、`urllib`で実装した。APIキーはヘッダーに付与されるが、ローカルの素のOllamaなら無視されるのでそのままで動くし、認証ありのリバースプロキシ環境でも機能する。

### 概要

**ollama_chat.py**: チャットクライアントのソースコード。**プロキシ無効**。

### ollama_chat.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Ollama Chat API Sample with Streaming
Purpose: Demonstrate chat interaction with Ollama API using standard libraries.
Description:
"""

# --- Configuration ---
API_KEY = "sk-ollama-dummy-key" # API Key (Ollama usually doesn't need this locally, but added for requirements)
API_URL = "http://localhost:11434/api/chat" # Ollama API Endpoint
MODEL_NAME = "llama3" # Target Model (Ensure this model is pulled: `ollama pull llama3`)
USER_NAME = "太郎" # Your name

"""
## 1. 概要
Ollamaの `/api/chat` エンドポイントを使用して、ストリーミング形式のチャットを行うPythonスクリプトです。
外部ライブラリ（requests等）を使用せず、Python標準ライブラリのみで構成されており、WSL2やLinux環境で即座に動作します。

## 2. 機能
* **API接続**: 指定されたURLとAPIキーを使用してOllamaへ接続。
* **ストリーミング受信**: レスポンスを逐次表示（Typewriter effect）。
* **コンテキスト維持**: 会話履歴（Messages）を保持して送信し、文脈を維持。
* **デモシナリオ**:
    1.  ユーザーの名前をAIに教える。
    2.  現在時刻を質問し、AIが名前を覚えているか確認する。

## 3. 更新履歴
* **v1.0.0 (2026-01-30)**: 初版作成。標準ライブラリ `urllib` による実装。

## 4. 使用方法
1.  `ollama_chat.py` の `API_KEY` や `MODEL_NAME` を環境に合わせて変更してください。
2.  実行権限を付与: `chmod +x ollama_chat.py`
3.  実行: `./ollama_chat.py`

## 5. 要件
* Python 3.12+ (推奨)
* 実行中のOllamaサーバー (デフォルト: http://localhost:11434)
* インストール済みのモデル (例: llama3)
"""

import json
import sys
import time
from urllib import request, error
from datetime import datetime

def send_chat_request(messages: list) -> str:
    """
    Sends a chat request to Ollama and prints the streaming response.
    Returns the complete response text.
    """
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        API_URL, 
        data=data, 
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
    )

    full_content = []

    try:
        with request.urlopen(req) as response:
            print(f"Assistant ({MODEL_NAME}): ", end="", flush=True)
            
            for line in response:
                if not line:
                    continue
                
                # Parse JSON chunk
                try:
                    decoded_line = line.decode("utf-8").strip()
                    if not decoded_line:
                        continue
                        
                    json_obj = json.loads(decoded_line)
                    
                    if json_obj.get("done") is False:
                        chunk = json_obj.get("message", {}).get("content", "")
                        print(chunk, end="", flush=True)
                        full_content.append(chunk)
                        
                except json.JSONDecodeError:
                    continue

            print("\n" + "-" * 40 + "\n")

    except error.URLError as e:
        print(f"\n[Error] Connection failed: {e}", file=sys.stderr)
        full_content = ["Error: Could not retrieve response."]

    except Exception as e:
        print(f"\n[Error] Unexpected error: {e}", file=sys.stderr)
        full_content = ["Error: An unexpected error occurred."]

    return "".join(full_content)


def main() -> None:
    """
    Main execution flow.
    """
    # --- 【追加】プロキシ無効化設定 (requestsの proxies=None と同等) ---
    # 空の辞書を渡すことで、環境変数のプロキシ設定を無視して直接接続させる
    proxy_handler = request.ProxyHandler({})
    opener = request.build_opener(proxy_handler)
    request.install_opener(opener)
    # ---------------------------------------------------------------

    print(f"--- Starting Session with {MODEL_NAME} ---")
    print(f"Current Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Session History
    history = []

    # 1. Introduce self
    user_input_1 = f"私の名前は{USER_NAME}です。私の名前を覚えてください。"
    print(f"User: {user_input_1}")
    
    history.append({"role": "user", "content": user_input_1})
    response_1 = send_chat_request(history)
    history.append({"role": "assistant", "content": response_1})

    # Wait a bit for clarity
    time.sleep(1)

    # 2. Ask for current time (and implicitly check memory)
    user_input_2 = "今何時ですか？ また、私の名前は何でしたか？"
    print(f"User: {user_input_2}")

    history.append({"role": "user", "content": user_input_2})
    response_2 = send_chat_request(history)
    history.append({"role": "assistant", "content": response_2})

    print("--- Session Ended ---")


if __name__ == "__main__":
    main()
```
