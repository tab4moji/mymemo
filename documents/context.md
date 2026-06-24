# 内部コンテキストと状態管理 (context.md)

⚠️ このドキュメントはリバースエンジニアリングにより自動生成された。

## 実行コンテキスト
ブラウザのメインスレッド（シングルスレッド）上のイベントループで実行される。

## 非同期処理と状態遷移

アプリケーションの初期化から表示完了までの非同期ライフサイクル。

```mermaid
stateDiagram-v2
    [*] --> Init : ページロード (loadMarkdown 実行)
    Init --> URL_Parse : URL パラメータからファイル名抽出
    URL_Parse --> Fetching : fetch('filename.md') リクエスト開始
    
    state Fetching {
        [*] --> Fetch_Success
        [*] --> Fetch_Error
    }

    Fetch_Error --> Error_Display : 例外発生
    Error_Display --> [*]

    Fetch_Success --> Parse_Fix : Markdown テキスト取得・ネスト修復 (fixNestedCodeBlocks)
    Parse_Fix --> Parse_HTML : marked.js による HTML パース
    Parse_HTML --> Sanitize : DOMPurify によるサニタイズ
    Sanitize --> DOM_Insert : #content 要素へ HTML 挿入
    DOM_Insert --> Link_Modify : 外部リンクに target="_blank" 付与
    Link_Modify --> Process_Codes : processCodeBlocks 実行
    Process_Codes --> Highlight : 各コードブロックのハイライト・DOM構築
    Highlight --> Ready : 描画完了

    state Ready {
        [*] --> User_Interaction
        User_Interaction --> Copy_Action : Copy ボタン押下
        User_Interaction --> Expand_Action : 折りたたみ箇所クリック
    }
```

### グローバル状態（設定値）
- `FOLD_THRESHOLD` (常数: `20`): コード折りたたみの境界行数。
- `SHOW_LINES` (常数: `10`): 折りたたみ時に残す上下の行数。
