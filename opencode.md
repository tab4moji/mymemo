## OpenCode

### 概要

エージェントコーディング CLI ツール。

### 公式サイト

- https://opencode.ai/
- https://github.com/anomalyco/opencode

### 噂

- サーバー側の ctx サイズは、32 Ki 以上じゃないと使い物にならない
- お仕事の種類によって接続先を変更できるらしい
  - https://opencode.ai/docs/ja/agents/#json
- cocoindex-code がいいらしい

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
  "model": "ollama_host/gemma4:12b",
  "provider": {
    "ollama_host": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama on Internal Server",
      "options": {
        "baseURL": "http://192.168.0.11:11434/v1",
      },
      "models": {
        "gemma4-12b-coder": {
          "name": "gemma4-12b",
          "max_tokens": 32768,
          "tools": true
        },
        "gemma4:12b": {
          "name": "gemma4:12b",
          "max_tokens": 32768,
          "tools": true
        }
      }
    }
  },
  "enabled_providers": ["ollama_host"],
  "autoupdate": false,
  "share": "disabled",
  "permission": {
    "websearch": "deny",
    "webfetch": "deny",
    "share": "deny",
    "read": {
      "*.env*": "deny",
      "*.pem": "deny"
    }
  },
  "experimental": {
    "openTelemetry": false
  },
  "mcp": {
    "cocoindex-code": {
      "type": "local",
      "command": [
        "uvx",
        "--prerelease=explicit",
        "--with",
        "cocoindex>=1.0.0a16",
        "cocoindex-code@latest"
      ]
    }
  }
}
```

### opencode と ollama の会話をチラ見

```bash:opencodeデバッグ
DB=~/.local/share/opencode/opencode.db
LAST_FILE=/tmp/opencode_last_ts

sqlite3 "$DB" "SELECT COALESCE(max(time_created), 0) FROM part;" < /dev/null > "$LAST_FILE"
echo "監視開始 (last=$(cat $LAST_FILE))"

inotifywait -m -e modify "${DB}-wal" 2>/dev/null | while IFS= read -r _; do
  LAST=$(cat "$LAST_FILE")

  sqlite3 "$DB" \
    "SELECT time_created, json_extract(data, '$.type'), substr(data, 1, 120)
     FROM part
     WHERE time_created > ${LAST}
     ORDER BY time_created ASC;" < /dev/null \
  | while IFS='|' read -r ts type data; do
      TIME=$(date -d "@$((ts / 1000))" '+%H:%M:%S')
      echo "[$TIME][$type] $data"
      echo "$ts" > "$LAST_FILE"
    done

done
```

### メモ

```markdown:システム指示 ~/.config/opencode/AGENTS.md
- 日本語で会話すること。
- 会話やコマンドでディレクトリー名を扱うときには必ず最後に/を付けること(例: ~/.config/)。
- ファイルを探すときは、ls コマンドを使わずに、-name または -iname でワイルドカードを加えた find コマンドを使うこと。
- 作業記録を書くときは、記録ファイルへ現在時刻を含んだタイトルで日記形式で作業内容を追加書き込みすること。
- 現在時刻をファイル名に含めるときは以下の形式を使うこと。
  - date +%Y_%m%d_%H%M_%S
- 文章の最後に「？」などがあって明確に質問文になっていたら、コード修正やコード実行などはせずに、質問に回答だけをすること。知らない、分からない、未だやっていないことがあれば正直に回答すること。
- 作業を依頼されたら、依頼された作業だけをせよ。依頼が終わったら、すぐに日本語で完了した内容とできなかったことを報告すること。
- cocoindex_search を使える場合、コードを調査するときには必ず cocoindex_search を使うこと。```
```

```markdown:コード分析
- このプロジェクトに含まれるドキュメントファイルとソースコードファイルに何があるか一覧を探して "./.works/docs_and_codes_<現在時刻>.md" というファイル名に記録せよ。本文中にも現在時刻を記録せよ。
```

```bash:cocoindex_code_search
uv tool install --upgrade 'cocoindex-code[full]'
```

2026年時点のOpenCodeの挙動に関する開発コミュニティの報告によると、設定ファイルの指定だけでは、モデルリストの取得（models.devへのアクセス）などで微小な外部通信が発生する場合がある。
これを完全に防ぎ、社内ネットワーク内に閉じ込めるには、OpenCodeの起動時に以下の環境変数を併用するのが有効だ。

```bash
export OPENCODE_DISABLE_AUTOUPDATE=true
export OPENCODE_DISABLE_SHARE=true
export OPENCODE_DISABLE_MODELS_FETCH=true

```

これらを `~/.bashrc` や `~/.zshrc` に記述しておくことで、意図しない外部へのデータ流出をより強固に防ぐことができる。

##
