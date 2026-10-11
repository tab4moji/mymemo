<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# cline cli では、ユーザープロンプトとLLM側の出力のログは全て保存されているか。

記録として残したい。

**Cline CLI では、ユーザープロンプトと LLM 側の全入出力ログがローカルにすべて自動保存されている**。明示的に削除しない限り消えることはなく、JSON 形式でそのまま取り出して記録や分析に利用できる。

## ログの保存場所とファイル構成

Cline CLI（VS Code 拡張版のコアと共通）は、デフォルトで `~/.cline/data/` 配下にタスクごとのフォルダを作成して管理している。

- **保存先ディレクトリ**\
`~/.cline/data/tasks/<タスクID>/`（または環境によって `~/.cline/data/sessions/<セッションID>/`）
- **保存されているファイル**
    - `api_conversation_history.json`: LLM API に実際に送受信されたシステムプロンプト、ユーザー入力、ツール実行要求、LLM のレスポンス生データを含む完全な通信ログ。
    - `ui_messages.json`: ターミナルや UI 上にレンダリングされたメッセージ履歴。
    - `~/.cline/data/logs/cline.log`: CLI 本体の動作ログ（`cline doctor log` で閲覧可能）。


## 記録として確認・エクスポートする方法

履歴の管理や抽出には、ビルトインの `cline history` コマンドが用意されている。

- **履歴一覧を JSON で取得**:[^1_1]

```bash
cline history --json
```

- **特定セッションのログを HTML としてエクスポート**:[^1_1]

```bash
cline history export <session-id> -o session.html
```

- **生ログ（JSON）を直接参照・バックアップ**:[^1_2]

```bash
cat ~/.cline/data/tasks/<タスクID>/api_conversation_history.json | jq .
```


## 運用時の留意点

`api_conversation_history.json` には、読み込んだソースコードやターミナルコマンドの実行結果、コンテキスト情報もすべて累積して記録される。そのため、長時間のタスクではファイルサイズが数十MB規模まで肥大化しやすい点に注意が必要だ。長期保存するなら、定期的に `tasks` ディレクトリのアーカイブや世代管理を組む運用が向いている。[^1_3]

<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://docs.cline.bot/cli/cli-reference

[^1_2]: https://zenn.dev/sunwood_ai_labs/articles/exploring-roo-cline-conversation-history

[^1_3]: https://github.com/cline/cline/issues/2321

[^1_4]: https://www.splunk.com/ja_jp/blog/artificial-intelligence/log-file-analysis-llms.html

[^1_5]: https://iret.media/154236

[^1_6]: https://zenn.dev/gvatech_blog/articles/11bc7181afff69

[^1_7]: https://kanata-ai.com/ja/topics/1176/

[^1_8]: https://qiita.com/syukan3/items/aa9bbd2e64701391f976

[^1_9]: https://ai-keiei.shift-ai.co.jp/prompt-log-management/

[^1_10]: https://note.com/masa_wunder/n/nff7854f8a593

[^1_11]: https://www.jiang.jp/posts/20250303_how_cline_works/

[^1_12]: https://zenn.dev/scogr_tech/articles/ai-blackbox-llm-thinking-log-design

[^1_13]: https://www.issoh.co.jp/tech/details/8489/

[^1_14]: https://docs.cline.bot/usage/cli-overview

[^1_15]: https://docs.cline.bot/core-workflows/working-with-files

[^1_16]: https://cline.bot/blog/cline-cli-return-to-the-primitives

[^1_17]: https://cline.bot/blog/system-prompt

[^1_18]: https://github.com/cline/cline/blob/main/apps/cli/README.md

[^1_19]: https://github.com/cline/cline/issues/7117

[^1_20]: https://github.com/cline/cline/issues/7932

[^1_21]: https://github.com/vshulcz/deja-vu/issues/253

[^1_22]: https://zenn.dev/ki0i0ro0/articles/cline-clt-windows-docker

[^1_23]: https://cline.ghost.io/introducing-cline-cli-2-0/

[^1_24]: https://www.reddit.com/r/CLine/comments/1p8rx34/cline_chat_history_disappeared/

[^1_25]: https://book.st-hakky.com/data-science/cline-cli-guide-2025

