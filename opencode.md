## OpenCode

### 概要

- https://opencode.ai/
- https://github.com/anomalyco/opencode

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

### メモ

```markdown:システム指示 ./AGENTS.md
- 会話やコマンドでディレクトリー名を扱うときには必ず最後に/を付けること(例: ~/.config/)。
- ファイルを探すときは、ls コマンドを使わずに、-name または -iname でワイルドカードを加えた find コマンドを使うこと。
- 作業記録を書くときは、記録ファイルへ現在時刻を含んだタイトルで日記形式で作業内容を追加書き込みすること。
- 現在時刻をファイル名に含めるときは以下の形式を使うこと。
  - date +%Y_%m%d_%H%M_%S
- 文章の最後に「？」などがあって明確に質問文になっていたら、コード修正やコード実行などはせずに、質問に回答だけをすること。知らない、分からない、未だやっていないことがあれば正直に回答すること。
- 作業を依頼されたら、依頼された作業だけをせよ。依頼が終わったら、すぐに日本語で完了した内容とできなかったことを報告すること。
```

```markdown:コード分析
- このプロジェクトに含まれるドキュメントファイルとソースコードファイルに何があるか一覧を探して "./.works/docs_and_codes_<現在時刻>.md" というファイル名に記録せよ。本文中にも現在時刻を記録せよ。
```

###
