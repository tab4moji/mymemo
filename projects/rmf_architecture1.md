# RMFアーキテクチャ 実装プロトコル (v1.0)

## Phase 1: 食品表示法の制定 (Schema Definition)

**目的:** データの「素性」と「寿命」を定義する。
**鉄則:** 生のデータ（intやstring）を裸で持ち歩くな。必ず「パッケージ」に入れろ。

### 手順 1-1: `FoodLabel` (ヘッダー) の定義

すべてのデータに添付される共通タグを作る。

```python
from dataclasses import dataclass, field
import time
import uuid

@dataclass(frozen=True)
class FoodLabel:
    """食品表示ラベル：データの管理情報を保持"""
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4())) # トレーサビリティID
    created_at: float = field(default_factory=time.time)             # 製造日時
    ttl: float = 60.0                                                # 消費期限 (秒)
    producer: str = "unknown"                                        # 製造者 (モジュール名)

    def is_rotten(self) -> bool:
        """腐っているか判定"""
        return (time.time() - self.created_at) > self.ttl

```

### 手順 1-2: `Packet` (製品) の定義

これが工場内を流れる「箱」になる。

* **Result (ROP)** の概念を取り入れ、エラー情報もこの箱に同梱できるようにする。

```python
from typing import Any, List, Optional

@dataclass
class Packet:
    """工場内を流れる共通コンテナ"""
    label: FoodLabel
    payload: Any              # 中身（原材料 or 製品）
    errors: List[str] = field(default_factory=list) # 異物検知ログ

    @property
    def is_contaminated(self) -> bool:
        """異物（エラー）が混入しているか"""
        return len(self.errors) > 0

    def add_error(self, error_msg: str):
        """異物を封入する（二重袋にする）"""
        self.errors.append(f"{time.time()}: {error_msg}")

```

---

## Phase 2: コンベアとゴミ箱の敷設 (Infrastructure)

**目的:** 通信経路を「キュー」として物理的に確保する。
**鉄則:** 関数呼び出しでデータを渡すな。キューに放り込め。

### 手順 2-1: Depth-N キューの設置

用途に合わせて深さ（Depth）を変える。

* **Ingest Queue (搬入口)**: `Depth=N` (バッファリングあり)
* **State Queue (最新状態)**: `Depth=1` (変数の代わり。常に最新のみ)
* **DLQ (廃棄物置き場)**: `Depth=Infinite` (絶対に溢れさせてはいけない)

```python
from queue import Queue, LifoQueue

class FactoryInfrastructure:
    def __init__(self):
        # 搬入口: センサーデータなどが来る (Depth-N)
        self.ingest_queue = Queue(maxsize=100)
        
        # 製品出荷口: 処理済みデータ (Depth-N)
        self.export_queue = Queue(maxsize=100)

        # DLQ (Dead Letter Queue): 異物・エラー・腐ったデータ (無限長)
        # ※ここが溢れる＝工場崩壊なので、ログファイル等に逃がす設計が理想
        self.dlq = Queue() 

```

---

## Phase 3: 絶対的調停者の任命 (The Arbiter)

**目的:** 唯一の「時間」と「状態」の支配者を置く。
**鉄則:** マルチスレッドでもロック（Lock/Mutex）を使うな。アービターだけが書き込める。

### 手順 3-1: 状態クラス (WorldState)

書き換え不可能な「スナップショット」として定義する。

```python
@dataclass(frozen=True)
class WorldState:
    """ある瞬間の工場の全状態"""
    tick: int = 0
    last_update: float = 0.0
    sensor_value: float = 0.0
    status_msg: str = "INIT"
    # ここにアプリケーション固有のデータを全部載せる

```

### 手順 3-2: アービターの実装

ここがメインループになる。

```python
class Arbiter:
    def __init__(self, infra: FactoryInfrastructure):
        self.infra = infra
        self.state = WorldState() # 初期状態

    def run_cycle(self):
        """工場の1クロックサイクル (この関数をループで回す)"""
        
        # 1. 搬入 (Non-blocking fetch)
        if self.infra.ingest_queue.empty():
            return # 何もなければ待機
        
        packet = self.infra.ingest_queue.get()

        # 2. 検品 (消費期限チェック)
        if packet.label.is_rotten():
            packet.add_error("Expired (TTL exceeded)")
            self.infra.dlq.put(packet) # DLQへ排出
            return

        # 3. 加工・状態更新 (ここだけが State を更新できる)
        try:
            new_state = self._process_logic(self.state, packet)
            self.state = new_state # 更新
            
            # 4. 出荷 (Snapshotの発行)
            # 読み取り専用のコピーを出荷ラインに乗せる
            self.infra.export_queue.put(self.state)

        except Exception as e:
            # 5. 緊急排出 (予期せぬエラーもDLQへ)
            packet.add_error(f"Critical Crash: {str(e)}")
            self.infra.dlq.put(packet)

    def _process_logic(self, current: WorldState, packet: Packet) -> WorldState:
        """純粋関数的なロジック部分"""
        # ここでデータの計算を行う
        val = packet.payload
        # ... 計算 ...
        return replace(current, 
                       tick=current.tick + 1,
                       sensor_value=val,
                       last_update=time.time())

```

---

## Phase 4: 作業員と例外の隔離 (Worker & Ejection)

**目的:** 外部からの入力や、重い処理を行う作業員（スレッド）を作る。
**鉄則:** 作業員はアービターに直接話しかけてはいけない。キューに「嘆願書」を入れるだけ。

### 手順 4-1: 外部入力ワーカー

例えば、M5Paperのタッチパネルや、APIからの受信。

```python
def input_worker(infra: FactoryInfrastructure):
    while True:
        try:
            # 外部データの取得 (例: センサー)
            raw_data = get_sensor_data() 
            
            # パッキング (食品表示ラベル貼り付け)
            label = FoodLabel(producer="SensorA", ttl=5.0)
            packet = Packet(label=label, payload=raw_data)
            
            # 搬入 (キューが満杯なら、ここで落とすか待つかを決める)
            infra.ingest_queue.put(packet, timeout=1.0)
            
        except Exception as e:
            # センサー自体の故障などもパッキングしてDLQへ送るのが理想
            # (printデバッグはしない)
            err_packet = Packet(FoodLabel(producer="SensorA"), payload=None)
            err_packet.add_error(f"Sensor Read Fail: {e}")
            infra.dlq.put(err_packet)
            
        time.sleep(0.1)

```

---

## Phase 5: 監視室の設置 (Observability)

**目的:** 工場が止まっていないか、DLQにゴミが溜まっていないかを確認する。

### 手順 5-1: DLQ監視モニター

これは別スレッドで回す。

```python
def dlq_monitor(infra: FactoryInfrastructure):
    while True:
        if not infra.dlq.empty():
            waste = infra.dlq.get()
            # ここでファイルに書き出すなり、警告灯を光らせるなりする
            print(f"【異物排出】Source: {waste.label.producer}, Reason: {waste.errors}")
        time.sleep(1.0)

```

---

## 運用チェックリスト (RMF Compliance)

コードを書くとき、以下の質問に答えられなければ RMF 違反だ。

1. **「その変数、いつ腐る？」** -> `FoodLabel.ttl` で定義されているか？
2. **「そのエラー、どこに行く？」** -> `catch` して握りつぶしていないか？ `DLQ` に入れているか？
3. **「誰が状態を変えている？」** -> `Arbiter` 以外の場所で `self.state` を書き換えていないか？
4. **「詰まったらどうする？」** -> キューのサイズ(`maxsize`)は適切か？ 溢れた時の挙動は決まっているか？
