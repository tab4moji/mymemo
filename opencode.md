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
- [cocoindex-code](https://tab4moji.github.io/mymemo/?content=cocoindex-code) がいいらしい

勝手なアクセスが不安なら、ip netns / iptables とかを使いましょう

- https://tab4moji.github.io/mymemo/?content=isolate


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
        "baseURL": "http://192.168.0.11:11434/v1"
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

### 起動時の注意

2026年時点のOpenCodeの挙動に関する開発コミュニティの報告によると、設定ファイルの指定だけでは、モデルリストの取得（models.devへのアクセス）などで微小な外部通信が発生する場合がある。
これを完全に防ぎ、社内ネットワーク内に閉じ込めるには、OpenCodeの起動時に以下の環境変数を併用するのが有効だ。

- https://tab4moji.github.io/mymemo/?content=isolate

```bash
export OPENCODE_DISABLE_AUTOUPDATE=true
export OPENCODE_DISABLE_SHARE=true
export OPENCODE_DISABLE_MODELS_FETCH=true
```

これらを `~/.bashrc` や `~/.zshrc` に記述しておくことで、意図しない外部へのデータ流出をより強固に防ぐことができる。

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

```markdown:コード分析
- このプロジェクトに含まれるドキュメントファイルとソースコードファイルに何があるか一覧を探して "./.works/docs_and_codes_<現在時刻>.md" というファイル名に記録せよ。本文中にも現在時刻を記録せよ。
```

```bash:コミット依頼
opencode run "\git add . && \git diff && \git diff --cahced して差分を確認してくれ。そしてコミット説明を日本語で考えて \git コミットしてプッシュもしてくれ。差分が無ければ何もしないでくれ。"
```

```markdown:システム指示 ~/.config/opencode/AGENTS.md
- 必ず日本語で報告すること。
- 会話やコマンドでディレクトリー名を扱うときには必ず最後に/を付けること(例: ~/.config/)。
- ファイルを探すときは、ls コマンドを使わずに、-name または -iname でワイルドカードを加えて find コマンドを使うこと。
- 作業記録を書くときは、記録ファイルへ現在時刻を含んだタイトルで日記形式で作業内容を追加書き込みすること。
- 現在時刻をファイル名に含めるときは以下の形式を使うこと。
  - date +%Y_%m%d_%H%M_%S
- 文章の最後に「？」などがあって明確に質問文になっていたら、コード修正やコード実行などはせずに、質問に回答だけをすること。知らない、分からない、未だやっていないことがあれば正直に回答すること。
- 作業を依頼されたら、依頼された作業だけをせよ。依頼が終わったら、すぐに日本語で完了した内容とできなかったことを報告すること。
- コードの調査や編集や作成には必ず aider-mcp-server を使うこと。
- コードの調査ではなるべく Grep を使わずに cocoindex-code を使うこと。
- 必ず日本語で報告すること。

Aiderはコードの自動記述だけでなく、**既存コードの調査や理解（コードリーディング、リバースエンジニアリング）にも非常に 強力なツール**として活用できます。
ファイル編集を行わずにコードベース全体を俯瞰して分析するための仕組みと専用のコマンドが備わっており、開発コミュニティでも「コードを読むための神器」として評価されています。
Aiderがコード調査に優れている理由と、具体的な使い方を解説します。

### 1. リポジトリ全体の構造を把握する「Repo Map」
AiderがただのチャットAIと異なる最大の理由は、コードベース全体の依存関係を理解する**Repo Map（リポジトリマップ）**機能 です。

- **Tree-sitterによる構文解析**: リポジトリ内の全ファイルを解析してAST（抽象構文木）を生成し、関数、クラス、変数などのシンボルを抽出します。
- **PageRankアルゴリズムによる重要度計算**: ファイル間の参照関係（importや関数呼び出しなど）をネットワークグラフ化し、PageRankアルゴリズムを用いて「どのファイル・シンボルがアーキテクチャ上重要か」をスコアリングします。

これにより、人間が関連ファイルをすべて手動で教えなくても、Aiderはプロジェクト全体の構造を背景知識（コンテキスト）とし て持った状態で回答できます。

### 2. 調査・分析に特化したコマンドとモード
Aiderにはコードを不用意に書き換えさせず、調査に専念させるためのモードが用意されています。

- **`/ask <質問>` （Askモード）**
  コードの変更を一切行わず、質問や分析のみを行うモードです。
  *「この決済処理のロジックはどのファイルに書かれている？」「この関数の時間計算量とボトルネックは？」「このクラスの役 割を説明して」* といったコードリーディングに最適です。
- **`/map`**
  現在Aiderが認識しているリポジトリマップ（関連性の高いクラスや関数の依存ツリー）をターミナル上に表示します。プロジェ クトの全体像を把握したい場合に便利です。
- **`/architect` （Architectモード）**
  コードを修正する際の「設計・計画」を行うモードです。OpenAI o1やo3-miniのような推論特化モデルをArchitect（設計者）と して動かし、リファクタリングの方針やアーキテクチャの改善案を立案させることができます（実際のコード編集は別の安価なEditorモデルが行う2段構成になります）。

### 3. Aiderを使ったコード調査の推奨ワークフロー
公式やコミュニティで推奨されている、大規模なコードベースを読み解く際の効果的なアプローチは以下の通りです。

1. **機能の特定（当たりをつける）**
   まずは変更・調査したい機能について尋ねます。
   `> /ask FXの自動発注機能のエントリーポイントはどのファイルにありますか？`
   （AiderがRepo Mapから推測して該当ファイルやクラスを提示してくれます）
2. **対象ファイルの追加**
   特定したファイルを明示的にコンテキストに追加し、より深く解析させます。
   `> /add src/trading/order_manager.py`
3. **詳細な分析とリバースエンジニアリング**
   追加したファイルに対して詳細な質問を投げます。
   `> /ask このクラスが依存している外部APIの呼び出しフローをマークダウンでまとめて`
   `> /ask このモジュールの仕様書をリバースエンジニアリングして作成して`
4. **（必要であれば）実装の反映**
   仕様を完全に把握し、方針が固まったら `/code` コマンドで実際の改修を依頼します。

このように、Aiderは「AIに考えさせてコードを書かせる」前の**「複雑なシステムの仕様を解きほぐす」フェーズ**で非常に役立 ちます。Pythonやシステムアーキテクチャの設計など、高度なエンジニアリングを行う際の強力な分析アシスタントとしてぜひ試してみてください。
```

##
