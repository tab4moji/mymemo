# 共通ライブラリ定義 (common_libs.md)

⚠️ このドキュメントはリバースエンジニアリングにより自動生成された。

## 外部依存ライブラリ一覧

### LIB-001: marked
- **用途:** Markdown テキストを HTML にパースする。
- **バージョン:** `15.0.0` 付近 (CDN: `https://cdn.jsdelivr.net/npm/marked/marked.min.js`)
- **使用モジュール:** `markdown_parse.js`
- **注意事項:** カスタムレンダラー (`marked.Renderer`) を設定し、`code` ブロック出力時に `data-title` などの独自属性を出力するようにしている。

### LIB-002: DOMPurify
- **用途:** パースされた HTML から悪意あるタグやスクリプトを排除し、サニタイズする。
- **バージョン:** 最新 (CDN: `https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js`)
- **使用モジュール:** `markdown_parse.js`

### LIB-003: highlight.js
- **用途:** コードブロックにシンタックスハイライトを適用する。
- **バージョン:** `11.9.0` (CDN: `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/...`)
- **追加言語:** `powershell.min.js` を個別に読み込んでいる。
- **使用モジュール:** `markdown.js`

### LIB-004: github-markdown-css
- **用途:** GitHub 風のマークダウンスタイルを適用する。
- **バージョン:** `5.8.1` (CDN: `https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown.min.css`)
- **使用モジュール:** `markdown.html`

### LIB-005: Roboto / JetBrains Mono (Google Fonts)
- **用途:** 本文の標準フォントおよびコード用の等幅フォントを提供。
- **使用モジュール:** `markdown.html`, `markdown.css`
