# LATEST_STATE
更新日時: 2026-06-25-1932-00 JST

## 現在の状態
見出しアンカー不具合の改修、およびMarkdown内リンク（`[text](url)`）の不具合修正が完了した。同一ドキュメント（`markdown.html`）でのクエリ変更遷移がブラウザ側でリロードされない問題に対して、History API（`pushState`）および `popstate` イベントによるSPA風の高速なページ内再ロード処理を実装し、遷移後のハッシュスクロールにも対応した。

## 完了済みタスク
- `markdown.html` の複数ファイルへの分割とテーマ切り替え機能の実装
- `markdown_parse.js` での marked.js バージョン互換性対応（オブジェクト引数と個別引数の双方に対応）
- `markdown_parse.js` での DOMPurify に対するデータ属性保持（`ALLOW_DATA_ATTR: true`）の適用
- `markdown.html` および `markdown.js` へのアセットキャッシュバスター（`?v=2` およびタイムスタンプクエリ）の付与
- `spec_markdown_compat_2026-0625-0843.md` およびログ（`2026-0625-0843-55.md`）の作成
- `markdown.js` にて `[text](url)` リンクの適正な解決（アンカー、外部リンク、ローカル相対マークダウン）
- History API を用いたSPA風の同一ページクエリ遷移、`popstate` 対応、および非同期ロード後のハッシュ自動スクロールの実装

## 次のタスク
- 各種リンク（アンカー、外部リンク、ローカル相対マークダウン、ハッシュ遷移）が意図通りに動作するかの手動確認
