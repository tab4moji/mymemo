# 仕様・設計ドキュメント化: markdown_marked_compat (spec_markdown_compat_2026-0625-0843.md)

⚠️ このドキュメントは不具合改修および仕様改善の成果として自動生成された。

## 概要
`marked.js` のバージョン差による見出しおよびコードブロックレンダラーの呼び出し引数（オブジェクトまたは個別引数）の互換性対応と、`DOMPurify` におけるデータ属性の保持に関する設計仕様。

## 入出力・依存関係の定義

### 1. 入力 (Inputs)
- **`marked.Renderer` の呼び出し:** `marked` パーサから渡されるレンダリング引数（新バージョンはオブジェクト `{ text, depth }` / `{ text, lang }`、旧バージョンは個別の引数 `(text, depth)` / `(text, lang)`）。

### 2. 出力 (Outputs)
- **サニタイズされた HTML:** `DOMPurify` を通した後も `data-anchor` 属性が維持された見出しおよびコードブロック。

### 3. 副作用 (Side Effects)
- クリップボードコピー処理の信頼性確保。

### 4. 依存関係 (Dependencies)
- **関連モジュール:** `markdown_parse.js` (レンダラーの防衛的引数処理とサニタイズ設定)

---

## 機能詳細と実装ロジック

### <core_logic> 1. marked レンダラーの防衛的引数パース </core_logic>
- **事実:** `renderer.heading` および `renderer.code` 内で、第1引数が `object` かつ `null` ではないかを判定。オブジェクトの場合は `{ text, depth/lang }` から値を抽出し、そうでない場合は個別引数から抽出する。
- **推論:** 外部 CDN から読み込まれる `marked.js` のバージョン変動やキャッシュ状態にかかわらず、確実に見出しIDの付与とコードブロックの拡張機能が動作するようにするため。

### <core_logic> 2. DOMPurify のデータ属性許可設定 </core_logic>
- **事実:** `DOMPurify.sanitize` を呼び出す際、第2引数に `{ ALLOW_DATA_ATTR: true }` オプションを渡す。
- **事実:** サニタイズ処理中に `data-anchor` などのカスタムデータ属性が削除されるのを防ぐ。

---

## 例外パスとエラーハンドリング
- **パラメータ不正:** 引数が不足している場合は空文字 `''` またはデフォルトの深さ `2` を適用し、スクリプトエラーを防ぐ。
