## OpenCode

### 概要

- https://opencode.ai/
- https://github.com/anomalyco/opencode

エージェントコーディング CLI ツール。

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
  },
  "mcp": {
    "cocoindex-code": {
      "type": "local",
      "command": [
        "ccc",
        "mcp"
      ],
      "environment": {
        "OLLAMA_API_BASE": "http://192.168.0.11:11434"
      }
    }
  }
}
```

### 企業向け opencode.json 設定

【概要・結論】

このURL（`https://opencode.ai/config.json`）は、ターミナルで動作するオープンソースのAIコーディングアシスタント「OpenCode」の設定ファイル（`opencode.json`）のJSONスキーマ定義だ。

社内利用においてソースコードや入力データを社外に出さない（完全ローカル・エアギャップ化する）ためには、クラウドのAIモデルではなくローカルLLMを利用する構成にした上で、OpenCodeのテレメトリ（利用状況送信）、共有機能、自動アップデート、Web検索ツールへのアクセスを無効化する設定をこのスキーマに沿って記述する必要がある。

【詳細・具体的な説明】

OpenCodeを完全ローカルで動かし、意図しない外部通信を防ぐための具体的な設定方法と構成を解説する。

#### 1. 設定ファイルの配置とスキーマ指定

設定ファイルは用途に合わせて以下の場所に作成する。

* グローバル設定：LinuxやWSLなら `~/.config/opencode/opencode.json`、Windowsネイティブなら `C:\Users\ユーザ名\.config\opencode\opencode.json`
* プロジェクト設定：対象プロジェクトのルートディレクトリに `opencode.json`

作成したファイルの先頭に、指定されたURLをスキーマとして設定する。これにより、エディタでの入力補完や構文チェックが有効になる。

#### 2. 社外通信を遮断する `opencode.json` の設定例

以下の設定を記述することで、外部APIやクラウドLLMへのデータ送信を防ぐことができる。

```json
{
  "$schema": "https://opencode.ai/config.json",
  "autoupdate": false,
  "share": "disabled",
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
  },
  "defaultFallback": [],
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
  }
}

```

**設定のポイント：**

* **`provider`**: OpenAIやAnthropicなどの外部プロバイダを外し、`@ai-sdk/openai-compatible` を利用してローカルのAPIエンドポイント（例はOllamaのデフォルトポート）へ向ける。
* **`autoupdate: false`**: アプリケーションの自動更新を停止する。
* **`share: "disabled"`**: セッションをURLで共有する機能を無効化する。
* **`permission`**: OpenCodeが自律的にWeb検索(`websearch`, `webfetch`)を行って外部サイトにアクセスするのを防ぐ。また、`.env`や秘密鍵などの機密ファイルを誤って読み込まないように制限をかける。
* **`experimental.openTelemetry`**: 内部のテレメトリ機能を無効化する。

#### 3. ハードウェアを活用したローカルLLM環境の構築

コードを社外に出さないためには、推論を行うLLM自体をローカルで動かす必要がある。利用可能なハードウェア環境の中で最もスペックの高い「Windows11 (Ryzen7 7735HS, 32GB RAM + RX 9060 XT 16GB)」のマシンをホストとして活用するのが最適だ。

#### 4. 補足：環境変数による完全な通信遮断

2026年時点のOpenCodeの挙動に関する開発コミュニティの報告によると、設定ファイルの指定だけでは、モデルリストの取得（models.devへのアクセス）などで微小な外部通信が発生する場合がある。
これを完全に防ぎ、社内ネットワーク内に閉じ込めるには、OpenCodeの起動時に以下の環境変数を併用するのが有効だ。

```bash
export OPENCODE_DISABLE_AUTOUPDATE=true
export OPENCODE_DISABLE_SHARE=true
export OPENCODE_DISABLE_MODELS_FETCH=true

```

これらを `~/.bashrc` や `~/.zshrc` に記述しておくことで、意図しない外部へのデータ流出をより強固に防ぐことができる。

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

###
