## cline cli

### ユーザープロンプトとLLM側の出力のログ

cline cli では、ユーザープロンプトとLLM側の出力のログは全て保存されているか。
記録として残したい。

**Cline CLI では、ユーザープロンプトと LLM 側の全入出力ログがローカルにすべて自動保存されている**。明示的に削除しない限り消えることはなく、JSON 形式でそのまま取り出して記録や分析に利用できる。

#### ログの保存場所とファイル構成

Cline CLI（VS Code 拡張版のコアと共通）は、デフォルトで `~/.cline/data/` 配下にタスクごとのフォルダを作成して管理している。

- **保存先ディレクトリ**\
`~/.cline/data/tasks/<タスクID>/`（または環境によって `~/.cline/data/sessions/<セッションID>/`）
- **保存されているファイル**
    - `api_conversation_history.json`: LLM API に実際に送受信されたシステムプロンプト、ユーザー入力、ツール実行要求、LLM のレスポンス生データを含む完全な通信ログ。
    - `ui_messages.json`: ターミナルや UI 上にレンダリングされたメッセージ履歴。
    - `~/.cline/data/logs/cline.log`: CLI 本体の動作ログ（`cline doctor log` で閲覧可能）。

#### 記録として確認・エクスポートする方法

履歴の管理や抽出には、ビルトインの `cline history` コマンドが用意されている。

- **履歴一覧を JSON で取得**

```bash
cline history --json
```

- **特定セッションのログを HTML としてエクスポート**

```bash
cline history export <session-id> -o session.html
```

- **生ログ（JSON）を直接参照・バックアップ**

```bash
cat ~/.cline/data/tasks/<タスクID>/api_conversation_history.json | jq .
```


#### 運用時の留意点

`api_conversation_history.json` には、読み込んだソースコードやターミナルコマンドの実行結果、コンテキスト情報もすべて累積して記録される。そのため、長時間のタスクではファイルサイズが数十MB規模まで肥大化しやすい点に注意が必要だ。長期保存するなら、定期的に `tasks` ディレクトリのアーカイブや世代管理を組む運用が向いている。
##
