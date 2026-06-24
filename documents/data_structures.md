# データ構造定義 (data_structures.md)

⚠️ このドキュメントはリバースエンジニアリングにより自動生成された。

## DS-001: コードブロック階層オブジェクト (Block)
- **用途:** `fixNestedCodeBlocks` 内でバッククォートによるネストしたコードブロックの深さを解析・調整するスタック処理に使用する。
- **データ型定義:**
  ```typescript
  interface Block {
      index: number;              // 開始フェンスの行番号 (0-indexed)
      indent: string;             // 開始フェンスのインデント文字列
      fence: string;              // フェンス記号 (例: '```')
      info: string;               // フェンスに続く情報文字列 (言語名やタイトル)
      children: Block[];          // 内包される子コードブロックのリスト
      closeIndex: number | null;  // 終了フェンスの行番号。未終了の場合は null
      closeIndent?: string;       // 終了フェンスのインデント文字列
  }
  ```
- **制約:**
  - `closeIndex` が `null` の場合は、末尾までブロックが閉じられていないと見なす。

## DS-002: URL パラメータ設定 (QueryParams)
- **用途:** 読み込む Markdown ファイル名を取得する。
- **データ型定義:**
  ```typescript
  interface QueryParams {
      content: string | null;     // '?content=xxx' から取得。デフォルトは 'README'
  }
  ```
