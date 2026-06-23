## OpenCode

### 概要

エージェントコーディング CLI ツール。

### 噂

- サーバー側の ctx サイズは、32 Ki 以上じゃないと使い物にならない
- お仕事の種類によって接続先を変更できるらしい
  - https://opencode.ai/docs/ja/agents/#json

### インストール

```bash
if [[ ! $(which opencode) ]]; then \curl -fsSL https://opencode.ai/install | bash && mkdir -p ~/.config/opencode/; fi
```

### アンインストール

```bash
if [[ $(which opencode) ]]; then opencode uninstall && { rm -rf ~/.cache/opencode; rm -rf ~/.config/opencode; rm -rf ~/.opencode; }; fi
```

### opencode.json 設定

```json:~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ollama/gemma4-12b-coder",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama",
      "options": {
        "baseURL": "http://192.168.0.11:11434/v1"
      },
      "models": {
        "gemma4-12b-coder": {
          "name": "gemma4-12b-coder",
          "tools": true
        }
      }
    }
  }
}
```

###
