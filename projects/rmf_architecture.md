小規模なスクリプトから大規模システムまで、この思想で統一して構築するための「標準化プロセス」をまとめる。名付けて**『Robust Micro-Factory (RMF) アーキテクチャ』**だ。
この手順に従えば、お前のコードは「書いた瞬間からレガシーコード」になることを防ぎ、常に**「稼働・監視・排出」が可能な工場**として機能する。

---

### 1. 概念図：Robust Micro-Factory (RMF)

まず、脳内イメージを統一する。
ソフトウェアを「処理」と見なさず、「工場のライン」と見なす。

```text
[Input Sources] 
      ↓ (Raw Materials)
[Ingest Queue] (Depth-N)
      ↓
+-----+---------------------------+
| ARBITER (The Boss & Clock)      | <--- [Read-Only Snapshot Request]
|  - Holds "World State"          | ---> [Immutable State Copy]
|  - Validates "Food Label"       |
+-----+---------------------------+
      | (Signed Products)
      V
[Processing Line] (Workers)
      |
     / \  (Switch)
   OK   NG (Exception)
   /     \
  V       V
[Output] [DLQ (Dead Letter Queue)]
(Store)  (Analysis/Log)

```

---

### 2. 構築手順：5ステップ・プロトコル

どんなに小さなツール（例えば `fx_tool.py`）を作る時も、必ずこの順序で思考し、コードを書く。

#### Step 1: 「食品表示法」の策定 (Define Schema First)

**「何をするか（関数）」から書くな。「何が流れるか（データ）」から書け。**
全てのデータの親となる「食品表示ラベル（メタデータ）」を定義する。

* **必須項目:**
* `id`: ユニークID
* `created_at`: 製造日時
* `expires_at`: 消費期限 (TTL)
* `payload`: 実際のデータ（中身）
* `trace`: 経由地スタンプ（リネージ）



#### Step 2: 「アービター」の召喚 (Define Authority)

**グローバル変数を直書きするな。アービターを通せ。**
「世界の状態（State）」を管理するクラスを1つだけ作る。

* **鉄則:**
* 状態（メモリ）を書き換えられるのはアービターだけ。
* 外部（UI、計算スレッド）は「嘆願書（Request）」を送るだけ。
* 外部は常に「配布されたスナップショット（Read-Only）」を見て描画・判断する。



#### Step 3: 「ラインと排出路」の敷設 (Setup Queues & DLQ)

**関数呼び出しで済ませるな。キューに繋げ。**
処理の連結部をすべてキューにする。そして、必ず「ゴミ箱（DLQ）」を用意する。

* **メインライン:** `work_queue` (Depth-N)
* **排出ライン:** `dead_letter_queue` (Depth-Inf)
* **思考法:** 「エラーが出たらどうしよう」ではなく「エラーが出たらこのベルトコンベア（DLQ）に乗せて、次のサイクルに進もう」と考える。

#### Step 4: 「作業員」の配置 (Implement Workers)

**複雑なロジックを書くな。単純な変換だけを行え。**
キューから取り出し、加工し、次のキューに入れるだけの「作業員（関数/クラス）」を作る。

* **ROP（鉄道指向）の実践:**
* 入力：`Package` (食品表示付き)
* 処理：成功なら `Result.Success(NewPackage)`、失敗なら `Result.Failure(ErrorPackage)` を返す。
* 例外(`try-catch`)はここで吸収し、`Failure`型として「正常に」returnする。



#### Step 5: 「監視室」の設置 (Observability)

**printデバッグをするな。DLQを見ろ。**
最後に、DLQの中身をファイルに吐き出すか、画面の隅に「警告アイコン」として出す仕組みを作る。

---

### 3. 実装テンプレート (Python Minimal)

これをコピペして削る（サブトラクティブ）のが一番早い。

```python
import time
from dataclasses import dataclass, field
from typing import Optional, Any, List
from queue import Queue, Empty

# --- 1. 食品表示法 (Universal Entity) ---
@dataclass(frozen=True)  # 基本的にイミュータブル
class FoodLabel:
    id: str
    timestamp: float = field(default_factory=time.time)
    ttl: float = 30.0  # 30秒で腐る
    source: str = "system"

@dataclass
class Packet:
    meta: FoodLabel
    data: Any
    errors: List[str] = field(default_factory=list)

    def is_rotten(self) -> bool:
        return (time.time() - self.meta.timestamp) > self.meta.ttl

# --- 2. 工場排出モデル (Result Type) ---
class Outcome:
    @staticmethod
    def success(packet: Packet, new_data: Any) -> Packet:
        # 加工成功：新しいデータを載せてリネージ更新
        return Packet(meta=packet.meta, data=new_data)

    @staticmethod
    def failure(packet: Packet, error_msg: str) -> Packet:
        # 加工失敗：エラー情報を追記（袋を二重にするイメージ）
        packet.errors.append(error_msg)
        return packet

# --- 3. 絶対的調停者 (Arbiter) ---
class Arbiter:
    def __init__(self):
        self._state = {} 
        self.inbox = Queue() # Depth-N Queue (Input)
        self.dlq = Queue()   # Dead Letter Queue (Waste)

    def process_cycle(self):
        try:
            # ノンブロッキングで取得
            req = self.inbox.get_nowait()
        except Empty:
            return

        # 期限切れチェック (腐ったポテトは即廃棄)
        if req.is_rotten():
            self.dlq.put(Outcome.failure(req, "Expired"))
            return

        # --- 処理実行 (Worker Logic) ---
        try:
            # 例: データを処理する
            if req.data == "METAL":
                raise ValueError("Metal detected!")
            
            # 成功時の状態更新（ここだけが書き込み権限を持つ）
            self._state[req.meta.id] = req.data
            print(f"[Arbiter] Updated: {req.data}")
            
        except Exception as e:
            # 例外すらも「正常な排出プロセス」として扱う
            dirty_packet = Outcome.failure(req, str(e))
            self.dlq.put(dirty_packet)
            print(f"[Arbiter] Rejected to DLQ: {e}")

# --- 4. 実行 (Operation) ---
if __name__ == "__main__":
    factory = Arbiter()

    # 正常品投入
    p1 = Packet(FoodLabel(id="1"), data="POTATO")
    factory.inbox.put(p1)

    # 異物投入 (Chaos Engineering)
    p2 = Packet(FoodLabel(id="2"), data="METAL")
    factory.inbox.put(p2)

    # 工場稼働
    for _ in range(3):
        factory.process_cycle()
        time.sleep(0.1)

    # DLQ確認
    while not factory.dlq.empty():
        waste = factory.dlq.get()
        print(f"検品所: ID={waste.meta.id} 理由={waste.errors}")

```

### まとめ：この設計の効能

この構成で組んでおけば、将来機能拡張するときに以下のことが可能になる。

1. **分散化:** `Queue` をネットワークソケットに変えるだけで、ブラジルのPCと連携できる（アーキテクチャが変わらない）。
2. **リプレイ:** DLQに溜まったデータを修正して、再度 `inbox` に戻せば、処理をやり直せる。
3. **デバッグ:** 「いつ、どのデータが、なぜ死んだか」が `FoodLabel` と `DLQ` に全て残っている。
