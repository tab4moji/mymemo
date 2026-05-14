## NotebookLM がやっていることの整理

NotebookLM のコアは「自分が投げ込んだ資料だけをソースにした RAG ベースのリサーチツール」だ。 frizky.web
PDF・Web・YouTube・Google Docs など複数ソースを 1 ノートブックにまとめて、要約・Q&A・コンテンツ生成・（ポッドキャスト的な）音声要約までやる感じだ。 theaiautomators

お前がローカルでやりたいのは、多分このあたりだと思う：

- 複数ドキュメントをまとめた「ノート」単位で管理
- ドキュメントに基づく要約・Q&A（RAG＋引用付き）
- できればオフライン or 自前サーバ上で完結
- 余裕があれば音声生成（Podcast っぽいもの）

以下、それに近い OSS をピックアップしてる。

***

## NotebookLM 近い系 OSS 一覧

ざっくり候補をまとめるとこんな感じ。

| プロジェクト | NotebookLM への近さ | 特徴ざっくり | ローカルLLM / Ollama | ポッドキャスト系 | セットアップ感 |
| --- | --- | --- | --- | --- | --- |
| Open Notebook (lfnovo/open-notebook) | かなり近い「公式クローン枠」 github | NotebookLM クローン＋マルチモデル対応、マルチモーダル、Podcast 生成あり greptile | 16+ プロバイダに対応、Ollama/LM Studio も可 greptile | マルチスピーカー Podcast 生成あり facebook | Docker Compose 前提で中〜上 greptile |
| SurfSense (MODSetter/SurfSense) | NotebookLM＋Perplexity＋Glean っぽいチーム向け github | 多数コネクタ＋チームコラボ＋ハイブリッド検索＆引用 github | LiteLLM 経由で Ollama/vLLM などローカル LLM OK github | 公式には Podcast までは言及なし | Docker でセルフホスト、中 github |
| AnythingLLM | 「文書にチャット」系の汎用 RAG ツール ai-comparator | マルチモデル対応、エージェント、RAG、デスクトップ版あり ai-comparator | Ollama/Gemini/OpenAI 等なんでも ai-comparator | 単体で Podcast 機能はなし | デスクトップ版は楽、サーバ版は Docker で中 ai-comparator |
| Khoj (khoj-ai/khoj) | 「AI セカンドブレイン」系、NotebookLM にかなり近い UX clawbot | ノート・PDF・GitHub などを RAG で横断、エージェント・自動化もあり clawbot | 自前ホスト可、任意の LLM を使える想定 clawbot | 音声までは明示されていない clawbot | Docker/Poetry 等で中 clawbot |
| InsightsLM (insights-lm-local-package) | 「NotebookLM クローン」として作られたツール theaiautomators | NotebookLM の機能を Supabase+n8n で再現、ドキュメント／Web／音声に対応 theaiautomators | local-ai パッケージで完全ローカル運用可能 github | Podcast 的な音声生成あり theaiautomators | Docker で一式立てる感じ、中〜上 github |
| notex (smallnest/notex) | シンプルな NotebookLM ライクな知識管理 github | 「インテリジェントノートブック」な知識管理アプリ github | LLM まわりは自前設定前提 | 情報少なめ | まだ触ってる人少なそう github |

この中で「まず 1 本に絞る」なら、  
- 機能バランス重視 → Open Notebook  
- チーム連携・多コネクタ重視 → SurfSense  
- 手軽なローカル版 NotebookLM っぽさ → AnythingLLM＋LM Studio 構成（日本語記事のレシピあり） note

***

## Open Notebook（lfnovo/open-notebook）

Open Notebook は「Google NotebookLM の OSS 実装」をうたっているプロジェクトで、一番ストレートに NotebookLM クローンを目指している。 github
Next.js（フロント）＋FastAPI（バックエンド）＋SurrealDB で構成され、Docker Compose でローカル or 自前サーバに簡単デプロイできるようになっている。 greptile

特徴として：

- NotebookLM との比較表を公式に出していて、「プライバシー」「モデル選択」「デプロイ自由度」などで上位互換を狙っている。 opentechhub
- 16 以上の AI プロバイダ（OpenAI, Anthropic, Ollama, LM Studio など）に対応していて、ローカル LLM やクラウド LLMを好きに組み合わせられる。 greptile
- PDF・動画・音声・Web ページなどのマルチモーダル入力に対応し、全文検索＋ベクター検索で RAG してくれる。 greptile
- NotebookLM の Podcast 機能相当として、マルチスピーカーの AI ポッドキャスト生成（スクリプト制御付き）も実装されている。 facebook

お前の WSL2 / Ubuntu24.04 なら Docker Compose 一発でスタックごと立てて、LLM 部分だけは Ollama か Gemini / OpenAI を刺す形が現実的だと思う。

***

## SurfSense（MODSetter/SurfSense）

SurfSense は「NotebookLM / Perplexity / Glean の OSS 代替」を標榜しているチーム向けリサーチハブだ。 github
Slack・Teams・Google Drive・Notion・GitHub など 25+ コネクタからナレッジを集約して、チームでリアルタイムにチャット・コメント・コラボできるのが売りになっている。 reddit

技術的には：

- Self-hostable（Docker）で、完全ローカル運用も想定されている。 github
- OpenAI 互換 API を LiteLLM 経由で叩く設計なので、Ollama や vLLM などのローカル LLM も普通にバックエンドにできる。 reddit
- ハイブリッド検索（ベクター＋全文）と引用付きレスポンスをサポートしていて、NotebookLM の「どのソースから引いてきたか」が見えるスタイルに近い。 reddit

個人用途でも使えるけど、MS Teams や Slack をすでに業務で使っているなら、将来的な「全部まとめて 1 つのリサーチハブ」にしやすい。

***

## AnythingLLM

AnythingLLM は「好きな LLM と文書にチャットするためのオールインワン OSS アプリ」という位置付けで、RAG とエージェント機能を内蔵したツールだ。 comparatore-ia
デスクトップアプリ版も OSS で提供されていて、個人用途ならインストールしてすぐ「ローカル版チャット with ドキュメント」が作れる。 ai-comparator

主なポイント：

- OpenAI, Anthropic, Gemini, Ollama, LM Studio など多数の LLM プロバイダに対応している。 comparatore-ia
- PDF, DOCX, TXT, CSV, MD, HTML, PPTX, XLSX など各種ドキュメントを読み込んで RAG してくれる。 comparatore-ia
- 日本語の記事で「LM Studio（推論担当）＋AnythingLLM（索引担当）」でローカル版 NotebookLM を作るレシピが紹介されていて、ネット切っても動く構成が実際に試されている。 note

NotebookLM ほどノート単位の UI・マインドマップ・Podcast まで全部入りではないが、「ローカルで資料読ませて要約・Q&A」はかなり手軽に再現できる。

***

## Khoj（khoj-ai/khoj）

Khoj は「AI セカンドブレイン」志向の OSS で、個人のノートや PDF、Markdown、GitHub リポジトリなどを RAG で横断検索しつつチャットできるツールだ。 clawbot
「ドキュメント検索＋チャット＋自動化」といった NotebookLM 的なワークフローを、より汎用的な「知識管理＋エージェント」に振った感じの設計になっている。 cetic

特徴として：

- 完全 OSS かつ self-hostable で、ローカルからエンタープライズまでスケールできる設計になっている。 clawbot
- 任意の LLM プロバイダと繋ぎ、エージェント・自動化・スケジューリングなども構成できる。 khoj
- 「Open Paper」「Pipali」など関連プロダクトも同じチームが作っていて、論文管理やファイル操作エージェントなどと連携できるエコシステムになりつつある。 github

NotebookLM というより「Obsidian＋AI」みたいな使い方に近いので、「自分のノート群や GitHub を丸ごと食わせるセカンドブレイン」が欲しいならこっち寄り。

***

## InsightsLM（insights-lm-local-package）

InsightsLM は「NotebookLM のクローン」として n8n＋Supabase＋LLM で構築された RAG アプリで、その完全ローカル版が `insights-lm-local-package` として公開されている。 github
元記事では、NotebookLM の閉じた性質（セルフホスト不可、カスタマイズ制限）を補うために、3 日でクローンを作ったというコンセプトで紹介されている。 theaiautomators

ローカル版パッケージの特徴：

- すべてのサービスを Docker コンテナでローカルに立ち上げ、完全オフラインで動かせるよう再設計されている。 github
- ドキュメントアップロード、Web スクレイピング、音声ファイル（MP3）などを扱え、チャット＋引用、Podcast 生成など NotebookLM 由来の機能を再現している。 theaiautomators
- バックエンド側は local-ai ベースに差し替えられていて、推論・埋め込み・音声まですべてローカルモデルで処理できる。 github

構成が少し重めなので、お前の Pentium マシン単体だとモデル次第で厳しいかもだが、「Colab 上で LLM コンテナを立てて、フロントだけローカル」みたいな分離も一応視野に入る。

***

## notex（smallnest/notex）

notex は「NotebookLM の OSS 代替」を名乗るシンプルな知識管理アプリで、「インテリジェントノートブックを作る」ことが目的のプロジェクトだ。 github
現状は他のプロジェクトほど詳細情報が出回っておらず、RAG 周りやマルチモーダル対応は自分で設定を詰める必要がありそうだ。 github

ただ、Go やシンプルなスタックで作られているので、軽量にサクッと動く「メモ＋AI」的なものが欲しいなら試す価値はある。
