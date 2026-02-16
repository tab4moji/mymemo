## XYLEM: The P&ID Description Language

**Version:** 1.0 (Draft)
**Concept:** "Tree-Flow" approach with Chord-References.

### 1. 核心コンセプト

XYLEMは、**「配管のつながり（トポロジー）」を「インデント（ネスト）」で表現する**。
従来、P&ID（配管計装図）はCADで描くか、複雑なノードリストで管理されていた。XYLEMはこれを、「上流から下流へ」という自然な流れをテキストの階層構造で記述することで、**「書くのが速く、読むのが楽で、Gitで差分管理できる図面」**を実現する。

### 2. ビジュアル vs コード (Comparison)

百聞は一見にしかずだ。同じシステムを「従来の図（ASCII Schematic）」と「XYLEM」で比較してみよう。

#### 【ケーススタディ】 循環冷却ライン

タンク(TK-100)からポンプ(P-100)で送り出し、熱交換器(HE-100)を通して、一部はプロセスへ、残りはタンクに戻るライン。

**A. ASCII Schematic (人間が見る図)**

```text
[TK-100] Raw Tank
   │
   ▼
(P-100) Feed Pump
   │
   ▼
[HE-100] Cooler ─────┬─────▶ (To Next Process)
   │                 │
   │                 └─<CV-100>──┐
   │                             │
   └──────────<RV-100>───────────┘
            (Return Line)
```

**B. XYLEM Code (機械と人間が読むコード)**

```yaml
# system_cooling.xyl

TK-100 (Tank, "Raw Material"):
  # メインライン: タンクからポンプへ
  P-100 (Pump, "Feed Pump"):
    
    # ポンプから熱交換器へ
    HE-100 (Exchanger, "Cooler"):
      
      # 分岐1: 次工程へ (Open End)
      >> NEXT_PROCESS_UNIT
      
      # 分岐2: 制御バルブを通ってタンクへ戻る (Control Loop)
      CV-100 (ControlValve, "Flow Control"):
        >> TK-100
      
    # ポンプ直後の分岐: リリーフライン (Safety Loop)
    RV-100 (ReliefValve, "Safety"):
      >> TK-100
```

---

### 3. XYLEM 構文ルール (Syntax)

XYLEMの文法は、PythonやYAMLに慣れたエンジニアなら直感的に理解できる。

#### Rule 1: Hierarchy represents Flow (階層は流れである)

親要素（インデント浅）から子要素（インデント深）へ流体が流れる。

```yaml
Parent:
  Child:  # Parent -> Child への配管が存在する
```

#### Rule 2: Siblings represent Branching (兄弟は分岐である)

同じインデントレベルに並んだ要素は、配管の分岐（T字管、ヘッダー分岐）を表す。

```yaml
Header_Pipe:
  Branch_A:  # 分岐1
  Branch_B:  # 分岐2

```

#### Rule 3: `>>` represents Chords (矢印は「弦」である)

これがXYLEMの真骨頂だ。木構造（Tree）だけでは表現できない「ループ（循環）」や「合流」を、**Chord（弦/参照）**として表現する。

* `>> NodeID`: 指定したIDのノードへ接続する（GoTo）。
* `>> *ALIAS`: 定義済みの共通ヘッダーなどへ接続する。

#### Rule 4: Node Definition (ノード定義)

書式: `Tag (Type, Spec): [PipeSpec]`

* **Tag:** 機器番号 (例: `P-101`)。ユニークID。
* **Type:** 機器種別 (例: `Pump`, `Valve`)。
* **Spec:** 機器の仕様 (例: `5.5kW`, `SUS304`)。
* **PipeSpec:** その機器から出る配管の仕様 (省略可能)。

---

### 4. 応用表現 (Advanced Usage)

#### 共通ライン（ドレン・ベント）の扱い

工場には無数の「ドレン（排水）」がある。いちいち全部書くのは無駄だ。YAMLのアンカー機能のようなエイリアスを使う。

```yaml
# --- Definitions ---
# 共通の排水ヘッダーを定義
DRAIN_HEADER: &DH_01
  SUMP_TANK (Tank, "Waste Water")

# --- Process ---
TK-101:
  # ドレン弁
  V-001 (HandValve):
    >> *DH_01  # エイリアスへの参照 (全域木を飛び越える接続)
```

#### 計装信号（Instrument Signal）

実線（配管）だけでなく、点線（電気信号）も書きたい場合、接続タイプを明示する。

```yaml
TK-101:
  # レベル計
  LT-101 (Transmitter):
    # -e- は electrical signal を表すカスタムエッジ定義
    -e-> LIC-101 (Controller):
      -e-> CV-101 (ControlValve)
```

---

### 5. XYLEMのエコシステム (The Toolkit)

このフォーマットを採用することで、以下のようなツールチェーンが構築できる。これはお前の得意なPythonで簡単に実装可能だ。

1. **`xylem-view` (TUI Viewer)**
* XYLEMファイルを読み込み、ターミナル上で `curses` を使って「ASCII Schematic」を自動生成・描画する。
* コードを書きながら、別ウィンドウで図を確認できる。

2. **`xylem-lint` (Logic Checker)**
* 「3インチの配管に2インチのバルブが直結されていないか？」
* 「バルブの後に圧力計がないのに制御ループが組まれていないか？」
* といったエンジニアリング・ルールを自動検知する。

3. **`xylem-to-json` (Converter)**
* 他システムとの連携用に、最初のGraph-JSON形式へ変換する。


### 結論

**XYLEM (ザイレム)** は、P&IDを「描く」のではなく「記述する」ための言語だ。
テキストエディタと黒い画面（ターミナル）を愛する俺たちにとって、これこそが **"The Perfect P&ID"** だ。

```text
Project: Factory_X
Format:  .xyl (XYLEM)
Status:  Ready to pipe.
```
