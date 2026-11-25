## cline cli

### ワークフローと自作

cline cli のワークフロー機能を使うのと、自分で cline コマンドに引数としてプロンプトを渡してハーネスしながらフローを進めるのと、どちらが実際のエージェンティックな開発として進めやすいか。

#### 回答

結論から言うと、**「自作の外部スクリプト（PythonやBashなど）からCline CLIを引数で呼び出し、プロンプトを制御（ハーネス）する方式」のほうが、実際のエージェンティックな開発としては圧倒的に進めやすく堅牢だ**。

Cline組み込みのワークフロー（`.clinerules/workflows/*.md`）は手軽だが、エージェントを自律制御する基盤としては決定的な限界を抱えている。

#### 2つの方式の決定的な違い

| 項目 | Cline CLIのワークフロー機能 (`/xxx.md`) | 外部スクリプトによるハーネス制御 (`cline -yolo "..."`) |
| :--- | :--- | :--- |
| **制御ループの主体** | LLM自身（プロンプトによる指示） | 外部プログラム（Python/Bashの確定ロジック） |
| **状態管理・分岐** | LLMの文脈理解に依存（破綻しやすい） | 終了コード・Git差分・テスト結果に応じた厳密分岐 |
| **コンテキスト消費** | 1つの巨大セッションに履歴が累積し圧迫 | ステップごとにコンテキストを初期化・選択注入可能 |
| **リカバリ性** | 迷走時に修正プロンプトを手動投入 | 失敗検知時にGitチェックアウトで巻き戻し再試行可能 |
| **デバッグ・可観測性** | チャットログ頼り | ログファイル、実行時間、入出力差分の追跡が容易 |

#### なぜ自作ハーネス方式がエージェンティック開発に向いているか

##### 1. 決定論的ロジックと自律推論の分離ができる
真に実用的なエージェントアーキテクチャでは、「ツールの実行順序や終了条件の判定」といった**決定論的な処理**は確定的なコード（Pythonやシェルスクリプト）に担わせる必要がある。
Clineのワークフロー機能は、Markdown内に手順を記述してLLMに「この順序で実行せよ」と指示する仕組み（プロンプト注入）に過ぎない。タスクが複雑化すると、LLMが手順を飛ばしたり、勝手に完了と判断して打ち切ったりするハルシネーションが発生する。
外部からハーネスすれば、「ステップ1完了を確認（exitコード0や指定ファイルの生成を検証）したら、その結果をもとにステップ2のプロンプトを投げてClineを起動する」という厳密なループを構築できる。

##### 2. コンテキストウィンドウの飽和と汚染を防げる
Cline単一のセッションで長大なワークフローを回すと、途中の試行錯誤やエラーログがコンテキストを圧迫し、モデルの推論精度が急激に低下する。
外部ハーネスであれば、以下の運用が可能になる。
- 調査フェーズ（コードベース解析）：結果を小さなMarkdownに要約出力させて終了
- 実装フェーズ：直前の要約ファイルだけを参照させて新規セッションでClineを実行
- 検証フェーズ：テストが失敗したら、エラーログだけを抽出して修正指示プロンプトを組み立てて再実行

##### 3. Git連携と自動ロールバックが容易
エージェントがコードを破壊した際、Cline内部のワークフローでは自然言語で「元に戻して」と頼む必要があり、余計にコードを壊すリスクがある。
外部ハーネスを持っていれば、各ステップの前後に`git stash`や`git checkout`を仕込むだけで、テストが通らなかった場合に確定で前回の正常ステートへロールバックし、別のアプローチで再プロンプトを投げられる。

#### ハーネス構成の具体例

外部ハーネスを組む場合、`cline`を非対話モード（ワンショット／YOLOモード）やJSON出力モードで呼び出し、Pythonなどの確定コードでラップするのが定石だ。

```bash
# 1. 計画フェーズ：現状の差分やタスクをもとにプランを出力させる
cline --yolo "issue #12 の仕様に基づき、変更計画を plan.md に出力せよ"

# 2. テストの実行（外部ツール側で判定）
pytest tests/
if [ $? -ne 0 ]; then
  # 3. 失敗ログだけを引数に渡して修正タスクを実行
  ERROR_LOG=$(tail -n 20 test.log)
  cline --yolo "以下のエラーを解消するように修正せよ: ${ERROR_LOG}"
fi
```

Clineのワークフロー機能は「日常的な定型作業（PR作成前のフォーマットチェックや単発のレビューなど）を人間がIDE/TUIから1打鍵で呼び出す」ためのショートカット機能としては優れている。しかし、自律的にタスクを分解し、検証・修正を繰り返す**エージェンティックな自動開発**を指向するなら、外部からプロンプトとコンテキストを制御するハーネス構造を採用すべきだ。

***

### ユーザープロンプトとLLM側の出力のログ

cline cli では、ユーザープロンプトとLLM側の出力のログは全て保存されているか。
記録として残したい。

#### 回答

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

***

### RAG の実現

AIエージェントを作ろうと思うが、その機能としてRAGを用意したい。
埋め込みモデルは必要か。

#### 回答

結論から言うと、RAGを組む設計手法によっては**必須ではない**。

ただし、意味的な曖昧検索（セマンティック検索）を行いたい場合は埋め込みモデル（Embedding）が必要になる。

#### 埋め込みモデルが不要なケース

RAGの本質は「外部情報を検索してコンテキストに挿入する」処理であり、検索手法はベクトル検索に限定されない。以下の構成なら埋め込みモデルなしで構築できる。

- **全文検索・キーワード検索（BM25 / SQLite FTS5 / Elasticsearch）**
  エラーログの完全一致、関数名、エラーコード、設定パラメータなど、単語が明確なドキュメント検索にはBM25の方が適している。
- **構造化データ検索（Text-to-SQL / SQLite）**
  エージェントにSQLクエリやJSONパースを行わせ、DBから直接レコードを抽出する手法。
- **ファイルシステム直接探索（Grep / ripgrep / AST解析）**
  コードベース探索エージェントでは、ripgrepやツリー走査ツールをエージェントに直接実行させる方が精度・即応性ともに高い場合が多い。
- **Web検索・外部API利用**
  外部検索エンジンのAPIを叩く場合、検索側でインデックスが完結しているためローカル側での埋め込みは不要だ。

#### 埋め込みモデルが必要なケース

検索対象の表現のブレや、抽象的な意味の一致を拾いたい場合は必要になる。

- 「〜が動かないときの対処法」のような自然言語の質問から、語句が一致しない関連ドキュメント（FAQや解説文）を拾いたい場合。
- 文脈やトピックの類似性に基づいた長期記憶（Memory）をエージェントに持たせたい場合。

#### 検索手法の比較

| 手法 | 埋め込みモデル | 長所 | 短所 | 最適な用途 |
| :--- | :--- | :--- | :--- | :--- |
| **BM25 / FTS** | 不要 | 低コスト、高速、固有名詞・記号に強い | 同義語や表現の揺らぎに弱い | ログ、ソースコード、識別子検索 |
| **ベクトル検索** | 必要 | 意味・意図の類似度で引ける 
| **ハイブリッド** | 必要 | キーワードと意味の両方をカバーできる 

#### 提案：最初のアプローチ

最初からベクトルデータベースや埋め込みモデルを導入すると、インデックス生成やモデル管理のオーバーヘッドが増加する。

まずは**SQLite（FTS5拡張）やripgrepを用いたキーワード検索ツール**をエージェントに持たせる形から試すことを推奨する。固有名詞やコード検索で十分機能するか確認し、同義語対応や自然言語での意味検索に限界を感じた段階で、埋め込みモデル（ローカルの軽量E5系やAPI経由など）を追加するのが最も手戻りが少ない。

RAGの対象とするデータ（コードベース、設定ファイル、メモ帳、Webページなど）の形式を教えてくれれば、最適な検索エンジンの構成を具体的に提示できる。

***

### pystdoc

[pystdoc](https://pypi.org/project/pystdoc/) は cline cli と併用する価値はあるか。
それとも純粋に cline cli のコーディング機能に任せた方が良いか。

#### 回答

**結論として、小規模な新規スクラッチ開発ならCline CLI単体で十分だが、既存コードベースの改修や中〜大規模プロジェクトを相手にするなら`pystdoc`を併用する価値が極めて高い。**

特に、純粋なドキュメント生成ツールとして使うのではなく、**「Cline CLI用のMCPサーバー（コンテキスト提供エンジン）」としてバックグラウンドで動かす使い方**において真価を発揮する。

#### 併用すべき理由と単体運用の比較

| 観点 | Cline CLI 単体（コーディング機能任せ） | Cline CLI + pystdoc 併用 |
| :--- | :--- | :--- |
| **コード探索方式** | `grep` / `find` / ディレクトリ全走査を繰り返す | ASTとトポロジカルソート済みのインデックスを参照 |
| **コンテキスト消費** | 関連ファイル全体をまるごと読み込んで枯渇 | 該当シンボルや影響範囲（Inbound/Outbound）のみをピンポイント注入 |
| **破壊的変更の検知** | 変更してみるまで依存先の壊れに気づきにくい | `pystdoc_trace_impact`等で呼び出し元を即座に特定可能 |
| **初動のオーバーヘッド** | ゼロ（即座にプロンプト実行） | 初回にインデックス生成コスト（LLM呼び出し/解析）が発生 |

#### 併用する最大のメリット

##### 1. Clineの「無駄な探索トークン消費」を激減させる
Cline CLIに「〇〇の処理を変更して」と指示すると、Clineは自律的にファイルを何個も開き、grepをかけ、数万トークンを浪費した末に迷走することがある。
`pystdoc`のMCPサーバー（`pystdoc mcp`）をClineに接続しておくと、以下の専用ツールをClineが直接叩けるようになる
- `pystdoc_locate_feature`: 「認証ヘッダーの追加箇所」といった自然言語クエリから、ファイル名と該当行番号を直接ピンポイント特定する。
- `pystdoc_trace_impact`: ある関数を変更・削除する前に、どこから呼ばれているか（呼び出し元ツリー）を逆引きする。

巨大なソースコードを何千行もコンテキストに流し込む必要がなくなるため、推論精度の劣化を防ぎ、1回の修正タスクを低コストで終わらせられる。

##### 2. ローカルLLM環境との相性が良い
Cline CLIから直接巨大なソースファイルを大量に読み込ませると、ローカルLLM（あるいはコンテキスト長が制限されたモデル）ではすぐに限界を迎える。
`pystdoc`はAST解析（`libclang`やPythonのASTなど）とグラフ探索（Tarjan/Kahnアルゴリズム）によってあらかじめ16K前後のコンパクトなチャンクに情報をトポロジカル集約している。そのため、推論リソースを浪費せずにエージェントへ的確な文脈を渡すことが可能だ。

#### 併用しない方がいい（Cline単体で良い）ケース

- **完全新規の小規模プロジェクト作成**
  まだコードが存在しない状態からファイルを新規作成していくフェーズでは、インデックス化する対象がないため無意味だ。
- **ファイル数個で完結する使い捨てスクリプト**
  全体が数百行程度の規模なら、Clineが直接ファイルを1つ読めば把握できるため、`pystdoc`のセットアップや初期同期の手間のほうが上回る。

#### 結論としての推奨アプローチ

Cline CLIの`settings`やMCP設定に`pystdoc mcp`を登録し、外部ハーネス側から以下のようにフェーズを分けて運用するのが最も堅牢だ。

1. **設計・改修フェーズ**: `pystdoc sync --fast`等でインデックスを最新化し、Clineには`pystdoc_locate_feature`や`pystdoc_trace_impact`を使わせて影響範囲を特定させる。
2. **実装フェーズ**: 特定された最小限のファイル・行範囲だけをCline CLIのコーディング機能に渡して書き換えさせる。

「コードの構造把握や依存追跡」はASTベースの`pystdoc`に任せ、「実際の差分編集やテスト実行」はCline CLIに任せるという明確な役割分担を敷くべきだ。

***

### pystdoc 以外のツール

pystdoc 以外で、LLM へのソースコード RAG 提供機能として優れているツールを探してくれ。

#### 回答

`pystdoc` のように**AST解析、コールグラフ、依存関係追跡（Impact Analysis）、MCP（Model Context Protocol）連携**を備え、ソースコードの構造的理解をLLMに提供するツールとして、特に優れている代表的なOSSを分類して紹介する。単純なテキスト分割ベクトル検索（Naive RAG）ではなく、**構文木（Tree-sitter等）やシンボルグラフを用いた「構造的コードRAG」**に絞って比較した。

#### 構造的コードRAGツールの代表格

##### 1. Codebase-Memory (DeusData/codebase-memory-mcp)
現在最も `pystdoc` と思想が近く、かつ高速・大規模に対応できるツールだ。
- **特徴**: C言語製エンジンとTree-sitterを統合し、リポジトリ全体を数秒でSQLiteのナレッジグラフへインデックス化する。
- **機能**: 158言語対応のシンボル抽出、コールグラフトラバーサル、変更時の影響範囲分析（Impact Analysis）、デッドコード検出、Cypherライクなクエリ実行に対応。
- **LLM連携**: 17個のMCPツールを公開しており、Claude CodeやOpenCodeなどのCoding Agentからファイル全体を読み込まずに必要な関数定義や呼び出し元だけをピンポイントで引き当てられる。
- **利点**: 単一バイナリ・外部依存なしで完結し、LLMに無駄なトークンを消費させない（事前解析でLLM APIコストをかけずASTだけで完結する）。

##### 2. Aider の Repo Map (aider-chat / grep-ast)
実務のコーディングエージェントで最も実績のある構造把握エンジンだ。
- **特徴**: Tree-sitterでリポジトリ全体のシンボル定義（関数・クラス）と参照箇所を抽出し、PageRankアルゴリズムで「重要度」を重み付けしてコードベースの地図（Repo Map）を動的に組み立てる。
- **派生ツール (`grep-ast`)**: Pythonライブラリとして単体公開されており、正規表現検索にヒットしたコード周辺の構文木（包含関係にある関数やクラス宣言、シグネチャ）だけを整形して抽出できる。
- **利点**: トークン予算（バジェット）に合わせて動的にコンテキストを圧縮できるため、コンテキスト幅が狭いローカルLLMへの注入に極めて向いている。

##### 3. code-review-graph
PRレビューや影響分析に特化したローカルナレッジグラフ生成ツールだ。
- **特徴**: Tree-sitterを用いてコードベースを解析し、関数・クラス・継承・呼び出し関係をローカルSQLiteに格納する。
- **機能**: コード変更時の波及範囲（Blast Radius）の計算や、呼び出し関係の可視化を得意とする。
- **利点**: `.code-review-graph/` 配下にキャッシュを保持し、MCP経由でエージェントに必要な関係性だけを渡せる。

##### 4. Code Index MCP (johnhuang316/code-index-mcp)
軽量かつ設定が平易なコード探索MCPサーバーだ。
- **特徴**: Tree-sitter（主要言語）とフォールバック解析を組み合わせ、シンボル定義・シグネチャのインデックス化を行う。
- **利点**: CursorやVS Code、Claude DesktopのMCPサーバーとして導入しやすく、エージェントが「どのファイルにどんなシグネチャがあるか」を高速に調べるツールとして動作する。

#### 主な機能比較

| ツール名 | 解析エンジン | インデックス保持 | LLM/Agent連携 | 主な強み |
| :--- | :--- | :--- | :--- | :--- |
| **pystdoc** | AST + libclang | SQLite / Markdown | MCP / CLI | 事前LLM要約 + トポロジカル依存ソート
| **Codebase-Memory** | Tree-sitter (158言語) | SQLite | MCP (17 tools) | 圧倒的な解析速度、コールグラフ、影響分析
| **Aider Repo Map** | Tree-sitter + PageRank | メモリ内動的生成 | CLI / Python API | トークン予算に収める重要度ベースの自動圧縮
| **grep-ast** | Tree-sitter | なし（オンデマンド） | CLI / Python API | 検索マッチ箇所に親クラス・関数構文を付与
| **code-review-graph** | Tree-sitter | SQLite | MCP / CLI | 変更の影響波及範囲（Blast Radius）分析

#### 選び方とおすすめ

1. **`pystdoc` の代替として最も高機能なMCPツールが欲しい場合**
   `Codebase-Memory` (`DeusData/codebase-memory-mcp`) が筆頭候補だ。インデックス作成時にLLMのAPIや推論リソースを食わず、Tree-sitterのみで一瞬でグラフを構築するため、ローカル環境でも負荷なく運用できる。

2. **ローカルLLMへのプロンプト注入でトークンを絞りたい場合**
   `aider` の `repomap.py` ロジック、または `grep-ast` の利用が適している。コンテキスト長が有限な小型モデルでも、関係ない実装コードを削ぎ落としてシグネチャと重要シンボルだけを渡すことができる。

##

## Cline CLIのOneshot料金確認方法

> cline cli でOneshotの処理が完了したあとの料金を知りたい

Cline CLI で Oneshot（ワンショット / 非対話モード）の処理が完了したあとのAPI利用料金やトークン消費量を確認する方法は、主に3つあります。

### 1. JSON出力オプションを付けて実行する（一番確実）

Cline CLI の実行時に JSON 形式で結果を出力するフラグ（`--json` や `-o json` など、バージョンにより異なります）を付けると、最終的なレスポンスデータ内に消費トークン数や算出コスト（`cost` や `usage` フィールド）が含まれます。

```bash
cline "あなたのプロンプト" --json
```

※ すでに完了してしまった過去の実行分には使えませんが、次回以降のコスト計測やスクリプトでの自動集計にはこの方法が最適です。

### 2. ローカルのタスク履歴ファイル（`ui_messages.json` / `api_conversation_history.json`）を見る

Cline（CLI版およびVS Code拡張機能版）は、実行したタスクの履歴をローカルストレージに保存しています。完了済みの Oneshot 処理の料金を後から知りたい場合は、履歴データから確認できます。

1. **保存場所を探す**
   Cline のタスク履歴は以下のディレクトリ配下の `tasks/<タスクID>/` フォルダに保存されています。
   - **CLI単体利用の場合:** `~/.cline/data/tasks/` または `~/.config/cline/tasks/`
   - **VS Code連携環境の場合:**
     - **macOS:**
       `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/`
     - **Linux:**
       `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks`
     - **Windows:**
       `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\tasks`

2. **ファイル内のコスト情報を検索する**
   最新の `<タスクID>` フォルダ内にある `ui_messages.json` を開き、`"cost"` で検索すると、各APIリクエストの料金や合計金額が記録されています。

```bash
# 最新のタスクフォルダ内の ui_messages.json から cost を抽出する例（macOS/Linux）
grep -o '"cost":[0-9.]*' ~/.cline/data/tasks/$(ls -t ~/.cline/data/tasks | head -n 1)/ui_messages.json
```

### 3. 利用しているAPIプロバイダーのダッシュボードで確認する

ローカルで計算された概算値ではなく、実際の正確な請求額を知りたい場合は、設定しているAPIプロバイダーの管理画面（Usage / Billing）を確認してください。

- **OpenRouter:** Activity ページでリクエストごとの正確な消費クレジット（`$`）と使用モデルが即座に確認できます。
- **Anthropic (Claude API):** Anthropic Console の **Usage** または **Cost** タブから時間帯別の利用額を確認できます。
- **OpenAI / Gemini API:** 各コンソールの Usage ダッシュボードから確認できます。

**補足：**
ローカルで表示・記録される料金は、Cline が内部に持っているモデルごとの単価テーブルから計算した概算値です。プロンプトキャッシュのヒット率やプロバイダー側の単価改定によって実際の請求額とわずかにズレることがあるため、正確な経費精算や予算管理を行う場合はプロバイダー側のダッシュボード（方法3）を正として確認することをおすすめします。

---

> opencodeでも同じことができる

はい、**OpenCode** でも同じく Oneshot（非対話モード）完了後の料金やトークン消費量を確認できます。やり方は Cline と同様に3つあります。

### 1. JSON出力オプションを付けて実行する（次回以降の計測用）

OpenCode の非対話実行コマンド（`opencode run` など）に `--format json`（または `-f json`）を付けて実行すると、イベントストリームの最後に出力されるステップ完了データ（`step_finish` など）の中に、トークン数と算出コスト（`cost`）が含まれます。

```bash
opencode run "あなたのプロンプト" --format json
```

※ すでに完了してしまった過去の実行分には使えませんが、CI/CDやスクリプトでコストを自動集計したい場合はこの方法が最も確実です。

### 2. ローカルのセッション履歴ファイルから確認する（完了済みの過去分）

OpenCode も実行したセッションの履歴やメタデータをローカルストレージに保存しています。完了済みの Oneshot 処理の料金を後から確認したい場合は、保存されている JSON ファイルを直接参照します。

1. **保存場所**
   OSの XDG データディレクトリ配下にセッションデータ（JSONファイル）が保存されています。
   - **macOS / Linux:** `~/.local/share/opencode/storage/`（または `~/.local/share/opencode/sessions/`）
   - **Windows:** `%LOCALAPPDATA%\opencode\storage\`

2. **コスト情報の確認**
   上記のディレクトリ内で更新日時が新しいファイルを探し、`"cost"` や `"tokens"` で検索すると、そのセッションでかかった API コストを確認できます。

```bash
# macOS / Linux で直近更新されたファイルから cost を検索する例
find ~/.local/share/opencode -type f -name "*.json" -exec grep -H '"cost"' {} +
```

※ また、対話モード（`opencode` 単体起動）で過去のセッションを開き直す（`--continue` / `-c` やセッション選択機能）と、TUI画面のヘッダーやステータスバーにそのセッションの累計コストが表示されるため、そこから確認することも可能です。

### 3. APIプロバイダーのダッシュボードで確認する

OpenCode のローカル計算値もモデル単価テーブルに基づく概算値です。プロンプトキャッシュの適用状況などを含めた正確な請求額は、利用しているプロバイダー側（OpenRouter、Anthropic Console、OpenAI Dashboard など）の Usage 画面で確認してください。

---

> jsonオプションを付けた場合で、計算するようなプログラムを作って

Cline CLI と OpenCode の両方で、`--json`（または `--format json`）オプションを付けて実行した際の出力（NDJSON / JSON Lines形式のイベントストリーム）から、**合計料金（cost）とトークン消費量を自動集計して表示するラッパープログラム（Python版とシェルスクリプト版）**を作成します。

どちらのツールも処理中に進捗イベントを1行ずつJSONで吐き出すため、リアルタイムにログを受け取りつつ、最終的に合計金額を合算してサマリーを出す仕組みにしています。

### 1. Python版（推奨：一番確実で読みやすい）

標準ライブラリのみで動作するため、追加インストールは不要です。Cline と OpenCode の両方の JSON 構造（`cost` フィールドや `usage` / `tokens` フィールド）を自動判別して合算します。

`calc_cost.py`

```python
#!/usr/bin/env python3
import sys
import json
import subprocess

def find_numbers_by_key(data, target_keys):
    """ネストされた辞書/リストから指定キーの数値をすべて抽出する"""
    total = 0.0
    if isinstance(data, dict):
        for k, v in data.items():
            if k in target_keys and isinstance(v, (int, float)):
                total += float(v)
            else:
                total += find_numbers_by_key(v, target_keys)
    elif isinstance(data, list):
        for item in data:
            total += find_numbers_by_key(item, target_keys)
    return total

def main():
    if len(sys.argv) < 2:
        print("使い方: python3 calc_cost.py <実行するコマンド...>")
        print('例1: python3 calc_cost.py cline "READMEを要約して" --json')
        print('例2: python3 calc_cost.py opencode run "バグを修正して" --format json')
        sys.exit(1)

    cmd = sys.argv[1:]
    total_cost = 0.0
    input_tokens = 0
    output_tokens = 0
    cache_read_tokens = 0

    print(f"実行中: {' '.join(cmd)}\n" + "-" * 50)

    # コマンドを実行し、標準出力を1行ずつリアルタイム処理
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    for line in process.stdout:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        try:
            event = json.loads(line_stripped)

            # 1. テキスト出力やアシスタントの応答があれば画面に表示
            if isinstance(event, dict):
                # Cline / OpenCode 共通のテキスト抽出（構造に応じて適宜表示）
                text = event.get("text") or event.get("content") or event.get("message")
                if isinstance(text, str) and text.strip():
                    print(text)

                # 2. コストの集計（cost または total_cost キーを探索）
                cost = find_numbers_by_key(event, {"cost", "total_cost", "totalCost"})
                if cost > 0:
                    total_cost += cost

                # 3. トークン数の集計（Cline / OpenCode 両対応）
                input_tokens += int(find_numbers_by_key(event, {"input", "input_tokens", "prompt_tokens", "tokensIn"}))
                output_tokens += int(find_numbers_by_key(event, {"output", "output_tokens", "completion_tokens", "tokensOut"}))
                cache_read_tokens += int(find_numbers_by_key(event, {"cache_read", "cacheRead", "cache_read_input_tokens"}))

        except json.JSONDecodeError:
            # JSON以外の通常ログ（エラーや警告など）はそのまま出力
            print(line_stripped)

    process.wait()

    # 結果サマリーの表示（1ドル=150円換算の目安も表示）
    jpy_rate = 150.0
    print("\n" + "=" * 50)
    print("📊 実行コスト・トークン集計結果")
    print("=" * 50)
    print(f"合計料金     : ${total_cost:.6f} (約 {total_cost * jpy_rate:.2f} 円 ※1$={jpy_rate}円換算)")
    print(f"入力トークン : {input_tokens:,} tokens")
    print(f"出力トークン : {output_tokens:,} tokens")
    if cache_read_tokens > 0:
        print(f"キャッシュ読込: {cache_read_tokens:,} tokens")
    print("=" * 50)

if __name__ == "__main__":
    main()
```

#### 使い方

実行権限を付与して、後ろにそのまま Cline や OpenCode のコマンドを渡すだけです。

```bash
chmod +x calc_cost.py

# Cline CLI の場合
./calc_cost.py cline "src/main.py をリファクタリングして" --json

# OpenCode の場合
./calc_cost.py opencode run "テストコードを追加して" --format json
```

### 2. ワンライナー版（`jq` コマンドを使う場合）

スクリプトファイルを作らず、ターミナル上で直接パイプ（`|`）で繋いで合計金額だけを出したい場合は `jq` を使うと便利です。

**OpenCode の場合：**

```bash
opencode run "あなたのプロンプト" --format json | jq -s '
  {
    total_cost_usd: ([.. | .cost? // empty] | add // 0),
    input_tokens: ([.. | .tokens?.input? // empty] | add // 0),
    output_tokens: ([.. | .tokens?.output? // empty] | add // 0)
  }
'
```

**Cline CLI の場合：**

```bash
cline "あなたのプロンプト" --json | jq -s '
  {
    total_cost_usd: ([.. | .cost? // empty] | add // 0),
    tokens_in: ([.. | .tokensIn? // .input_tokens? // empty] | add // 0),
    tokens_out: ([.. | .tokensOut? // .output_tokens? // empty] | add // 0)
  }
'
```

### プログラムのポイント

- **複数ステップの合算に対応:** エージェントがファイル検索→編集→テスト実行のように内部で複数回 API を叩いた場合でも、各ステップ（`step_finish` や `api_req_started` 等）の JSON イベントに含まれる `cost` をすべて足し合わせて **1タスク全体の総額**を出します。
- **JSONスキーマの差異を吸収:** Cline と OpenCode で微妙に異なるキー名（`input` vs `tokensIn` vs `input_tokens` など）やネスト構造を再帰的に探索して拾う設計にしています。

---

> jsonファイルを入力しても大丈夫

はい、**すでに出力済みの JSON ファイルを入力して計算することも可能です！**

先ほどのスクリプトはコマンドを直接実行する仕様になっていたため、**「コマンド実行」と「保存済みのJSONファイル読み込み（またはパイプ入力）」**の両方に対応した改良版を用意しました。

事前に `cline ... --json > result.json` のようにファイルに保存しておき、後から何度でも料金を再計算・確認したい場合に便利です。

### ファイル入力・パイプ・コマンド実行のすべてに対応した改良版

`calc_cost.py`

```python
#!/usr/bin/env python3
import sys
import os
import json
import subprocess

def find_numbers_by_key(data, target_keys):
    """ネストされた辞書/リストから指定キーの数値をすべて抽出する"""
    total = 0.0
    if isinstance(data, dict):
        for k, v in data.items():
            if k in target_keys and isinstance(v, (int, float)):
                total += float(v)
            else:
                total += find_numbers_by_key(v, target_keys)
    elif isinstance(data, list):
        for item in data:
            total += find_numbers_by_key(item, target_keys)
    return total

def parse_lines(lines, show_text=True):
    """行のイテレータからコストとトークンを集計する"""
    total_cost = 0.0
    input_tokens = 0
    output_tokens = 0
    cache_read_tokens = 0

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        try:
            event = json.loads(line_stripped)
            if isinstance(event, dict):
                # リアルタイム実行時などはテキストも表示
                if show_text:
                    text = event.get("text") or event.get("content") or event.get("message")
                    if isinstance(text, str) and text.strip():
                        print(text)

                # コストとトークンの集計
                total_cost += find_numbers_by_key(event, {"cost", "total_cost", "totalCost"})
                input_tokens += int(find_numbers_by_key(event, {"input", "input_tokens", "prompt_tokens", "tokensIn"}))
                output_tokens += int(find_numbers_by_key(event, {"output", "output_tokens", "completion_tokens", "tokensOut"}))
                cache_read_tokens += int(find_numbers_by_key(event, {"cache_read", "cacheRead", "cache_read_input_tokens"}))

        except json.JSONDecodeError:
            # 1つの大きなJSON配列ファイル([...])だった場合のフォールバック処理
            pass

    return total_cost, input_tokens, output_tokens, cache_read_tokens

def main():
    total_cost = 0.0
    input_tokens = 0
    output_tokens = 0
    cache_read_tokens = 0

    # パターンA: パイプ入力 (cat result.json | python3 calc_cost.py)
    if not sys.stdin.isatty() and len(sys.argv) == 1:
        total_cost, input_tokens, output_tokens, cache_read_tokens = parse_lines(sys.stdin, show_text=False)

    # パターンB: 引数にJSONファイルパスを指定 (python3 calc_cost.py result.json)
    elif len(sys.argv) == 2 and os.path.isfile(sys.argv[1]):
        filepath = sys.argv[1]
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            # まずNDJSON（1行1JSON）として解析
            total_cost, input_tokens, output_tokens, cache_read_tokens = parse_lines(content.splitlines(), show_text=False)

            # もし0件（単一のJSONオブジェクトまたは配列ファイル）なら全体をjson.loadsして解析
            if total_cost == 0 and input_tokens == 0 and output_tokens == 0:
                try:
                    whole_data = json.loads(content)
                    total_cost = find_numbers_by_key(whole_data, {"cost", "total_cost", "totalCost"})
                    input_tokens = int(find_numbers_by_key(whole_data, {"input", "input_tokens", "prompt_tokens", "tokensIn"}))
                    output_tokens = int(find_numbers_by_key(whole_data, {"output", "output_tokens", "completion_tokens", "tokensOut"}))
                    cache_read_tokens = int(find_numbers_by_key(whole_data, {"cache_read", "cacheRead", "cache_read_input_tokens"}))
                except json.JSONDecodeError:
                    print("エラー: 有効なJSONファイルではありません。", file=sys.stderr)
                    sys.exit(1)

    # パターンC: コマンドを直接実行 (python3 calc_cost.py cline "..." --json)
    elif len(sys.argv) >= 2:
        cmd = sys.argv[1:]
        print(f"実行中: {' '.join(cmd)}\n" + "-" * 50)
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        total_cost, input_tokens, output_tokens, cache_read_tokens = parse_lines(process.stdout, show_text=True)
        process.wait()

    else:
        print("使い方:")
        print("  1. JSONファイルを指定: python3 calc_cost.py output.json")
        print("  2. パイプで渡す      : cat output.json | python3 calc_cost.py")
        print('  3. コマンドを直接実行: python3 calc_cost.py cline "プロンプト" --json')
        sys.exit(1)

    # 結果サマリーの表示
    jpy_rate = 150.0
    print("\n" + "=" * 50)
    print("📊 実行コスト・トークン集計結果")
    print("=" * 50)
    print(f"合計料金     : ${total_cost:.6f} (約 {total_cost * jpy_rate:.2f} 円 ※1$={jpy_rate}円換算)")
    print(f"入力トークン : {input_tokens:,} tokens")
    print(f"出力トークン : {output_tokens:,} tokens")
    if cache_read_tokens > 0:
        print(f"キャッシュ読込: {cache_read_tokens:,} tokens")
    print("=" * 50)

if __name__ == "__main__":
    main()
```

### 3通りの使い方

#### ① 保存済みの JSON ファイルを直接指定する

Cline や OpenCode の履歴フォルダにある `ui_messages.json` などをそのまま渡すこともできます。

```bash
# リダイレクトで保存したファイルを計算
cline "コードレビューして" --json > output.json
python3 calc_cost.py output.json

# Clineのローカル履歴ファイル(ui_messages.json)を直接指定して計算することも可能
python3 calc_cost.py ~/.cline/data/tasks/<タスクID>/ui_messages.json
```

#### ② パイプ（`|`）で繋いで渡す

```bash
opencode run "リファクタリングして" --format json | python3 calc_cost.py
```

#### ③ これまで通りコマンドを直接実行する

```bash
python3 calc_cost.py opencode run "リファクタリングして" --format json
```

### 改良のポイント

- **NDJSON と 通常のJSON配列 の両対応:** CLI の標準出力（1行ごとにJSONが並ぶ形式）だけでなく、Cline の履歴ファイル `ui_messages.json` のような「1つの大きな `[ ... ]` 配列形式のJSONファイル」も自動で判別して集計できるようにしています。

---

> ディレクトリ内の複数のJSONファイルをまとめて指定して、全タスクの合計コストを一括集計できるようにしたいです。

ディレクトリ内の複数の JSON ファイルをまとめて指定し、**ファイル（タスク）ごとの内訳と全体の合計コストを一括集計できる拡張版**を作成しました。

ディレクトリパスを渡すと配下の `.json` ファイルを自動で探索して集計するほか、シェルのワイルドカード（`*.json` や `~/.cline/data/tasks/*/ui_messages.json` など）で複数ファイルを直接渡すこともできます。

### 複数ファイル・ディレクトリ一括集計対応版

`calc_cost.py`

```python
#!/usr/bin/env python3
import sys
import os
import json
import subprocess
from pathlib import Path

# 抽出対象のキー定義
COST_KEYS = {"cost", "total_cost", "totalCost"}
INPUT_KEYS = {"input", "input_tokens", "prompt_tokens", "tokensIn"}
OUTPUT_KEYS = {"output", "output_tokens", "completion_tokens", "tokensOut"}
CACHE_KEYS = {"cache_read", "cacheRead", "cache_read_input_tokens"}

def find_numbers_by_key(data, target_keys):
    """ネストされた辞書/リストから指定キーの数値をすべて抽出する"""
    total = 0.0
    if isinstance(data, dict):
        for k, v in data.items():
            if k in target_keys and isinstance(v, (int, float)):
                total += float(v)
            else:
                total += find_numbers_by_key(v, target_keys)
    elif isinstance(data, list):
        for item in data:
            total += find_numbers_by_key(item, target_keys)
    return total

def parse_lines(lines, show_text=False):
    """行のイテレータ（NDJSON）からコストとトークンを集計する"""
    cost = 0.0
    in_tok = 0
    out_tok = 0
    cache_tok = 0

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        try:
            event = json.loads(line_stripped)
            if isinstance(event, dict):
                if show_text:
                    text = event.get("text") or event.get("content") or event.get("message")
                    if isinstance(text, str) and text.strip():
                        print(text)

                cost += find_numbers_by_key(event, COST_KEYS)
                in_tok += int(find_numbers_by_key(event, INPUT_KEYS))
                out_tok += int(find_numbers_by_key(event, OUTPUT_KEYS))
                cache_tok += int(find_numbers_by_key(event, CACHE_KEYS))
        except json.JSONDecodeError:
            pass

    return cost, in_tok, out_tok, cache_tok

def parse_file(filepath):
    """1つのJSONファイルを解析する（NDJSON / 単一JSON配列の両対応）"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"⚠️ 読み込みスキップ ({filepath}): {e}", file=sys.stderr)
        return 0.0, 0, 0, 0

    # 1. NDJSON（1行1JSON）として解析を試みる
    cost, in_tok, out_tok, cache_tok = parse_lines(content.splitlines(), show_text=False)

    # 2. 0件だった場合、単一のJSON配列またはオブジェクトとして全体を解析
    if cost == 0 and in_tok == 0 and out_tok == 0:
        try:
            whole_data = json.loads(content)
            cost = find_numbers_by_key(whole_data, COST_KEYS)
            in_tok = int(find_numbers_by_key(whole_data, INPUT_KEYS))
            out_tok = int(find_numbers_by_key(whole_data, OUTPUT_KEYS))
            cache_tok = int(find_numbers_by_key(whole_data, CACHE_KEYS))
        except json.JSONDecodeError:
            pass

    return cost, in_tok, out_tok, cache_tok

def collect_json_files(paths):
    """指定されたファイル/ディレクトリのリストからJSONファイルパスを収集する"""
    target_files = []
    for p in paths:
        path_obj = Path(p)
        if path_obj.is_file():
            target_files.append(path_obj)
        elif path_obj.is_dir():
            # ディレクトリ配下の .json ファイルを再帰的に取得（更新日時順）
            found = sorted(path_obj.rglob("*.json"), key=lambda x: x.stat().st_mtime)
            target_files.extend(found)
    return target_files

def main():
    total_cost = 0.0
    total_in = 0
    total_out = 0
    total_cache = 0
    jpy_rate = 150.0

    # パターンA: パイプ入力 (cat result.json | python3 calc_cost.py)
    if not sys.stdin.isatty() and len(sys.argv) == 1:
        total_cost, total_in, total_out, total_cache = parse_lines(sys.stdin, show_text=False)

    # パターンB: 引数がすべてファイルまたはディレクトリの場合（複数指定・一括集計）
    elif len(sys.argv) >= 2 and all(os.path.exists(arg) for arg in sys.argv[1:]):
        files = collect_json_files(sys.argv[1:])
        if not files:
            print("指定されたパス内にJSONファイルが見つかりませんでした。", file=sys.stderr)
            sys.exit(1)

        print(f"📂 対象ファイル数: {len(files)} 件")
        print("-" * 75)
        print(f"{'料金 (USD)':>12} | {'入力Tok':>10} | {'出力Tok':>10} | ファイルパス")
        print("-" * 75)

        valid_count = 0
        for filepath in files:
            cost, in_tok, out_tok, cache_tok = parse_file(filepath)
            # コストまたはトークンが含まれるファイルのみ明細表示＆加算
            if cost > 0 or in_tok > 0 or out_tok > 0:
                valid_count += 1
                total_cost += cost
                total_in += in_tok
                total_out += out_tok
                total_cache += cache_tok
                print(f"${cost:11.6f} | {in_tok:10,} | {out_tok:10,} | {filepath}")

        print("-" * 75)
        print(f"集計対象タスク数: {valid_count} 件")

    # パターンC: コマンド直接実行 (python3 calc_cost.py cline "..." --json)
    elif len(sys.argv) >= 2:
        cmd = sys.argv[1:]
        print(f"実行中: {' '.join(cmd)}\n" + "-" * 50)
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        total_cost, total_in, total_out, total_cache = parse_lines(process.stdout, show_text=True)
        process.wait()

    else:
        print("使い方:")
        print("  1. ディレクトリ一括集計: python3 calc_cost.py ./logs/")
        print("  2. 複数ファイル指定    : python3 calc_cost.py task1.json task2.json")
        print("  3. ワイルドカード指定  : python3 calc_cost.py ~/.cline/data/tasks/*/ui_messages.json")
        print("  4. パイプで渡す        : cat output.json | python3 calc_cost.py")
        print('  5. コマンド直接実行    : python3 calc_cost.py cline "プロンプト" --json')
        sys.exit(1)

    # 全体サマリーの表示
    print("\n" + "=" * 55)
    print("📊 合計コスト・トークン集計結果")
    print("=" * 55)
    print(f"合計料金     : ${total_cost:.6f} (約 {total_cost * jpy_rate:,.2f} 円 ※1$={jpy_rate}円換算)")
    print(f"入力トークン : {total_in:,} tokens")
    print(f"出力トークン : {total_out:,} tokens")
    if total_cache > 0:
        print(f"キャッシュ読込: {total_cache:,} tokens")
    print("=" * 55)

if __name__ == "__main__":
    main()
```

### 使い方と出力イメージ

#### 1. ディレクトリを指定して配下を丸ごと一括集計

サブディレクトリも含めて `.json` ファイルを自動で探し出し、コストデータが含まれるファイルだけを抽出して合算します。

```bash
# 保存したログディレクトリを丸ごと集計
python3 calc_cost.py ./my_oneshot_logs/

# Cline のローカル全タスク履歴を一括集計する例
python3 calc_cost.py ~/.cline/data/tasks/

# OpenCode のローカル全セッション履歴を一括集計する例
python3 calc_cost.py ~/.local/share/opencode/storage/
```

#### 2. ワイルドカード（`*`）で特定のファイルだけ指定

Cline のタスクフォルダには `api_conversation_history.json` など別のJSONも混在しているため、特定ファイル名だけを狙い撃ちしたい場合はワイルドカードが便利です。

```bash
python3 calc_cost.py ~/.cline/data/tasks/*/ui_messages.json
```

#### 出力イメージ

```text
📂 対象ファイル数: 3 件
---------------------------------------------------------------------------
  料金 (USD) |    入力Tok |    出力Tok | ファイルパス
---------------------------------------------------------------------------
$   0.012450 |      4,120 |        380 | logs/task_01.json
$   0.045200 |     15,800 |      1,240 | logs/task_02.json
$   0.008100 |      2,900 |        210 | logs/task_03.json
---------------------------------------------------------------------------
集計対象タスク数: 3 件

=======================================================
📊 合計コスト・トークン集計結果
=======================================================
合計料金     : $0.065750 (約 9.86 円 ※1$=150.0円換算)
入力トークン : 22,820 tokens
出力トークン : 1,830 tokens
=======================================================
```

### 実装の工夫点

- **無関係なJSONの自動除外:** ディレクトリ内に設定ファイルやコスト情報を含まない別用途の `.json` が混ざっていても、`cost > 0` またはトークン数が存在するファイルだけを明細行に出力するため、ノイズになりません。
- **更新日時順ソート:** ディレクトリ指定時はファイルの更新日時順（古い順→新しい順）に並べて表示するため、時系列でどのタスクにいくらかかったかが追いやすくなっています。

##
