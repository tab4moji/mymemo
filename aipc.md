## AI PC

### 2026/6/19

- GMKtec K16 AMD Ryzen7 7735HS搭載【DDR5 32GB 6400MT/s +1TB SSD】
  - https://www.amazon.co.jp/dp/B0GGBR5YFF
  - ￥94,998 税込

- 玄人志向 RD-RX9060XT-E16GB/WHITE/DF
  - https://www.amazon.co.jp/dp/B0FDGBTV9S
  - ￥59,001 税込

- AOOSTAR AG01 eGPUドックドッキングステーション
  - https://www.amazon.co.jp/dp/B0DWMTPG91
  - ￥23,180 税込

###  2026/6/23

#### 概要

`misc dxg: dxgk: ... Ioctl failed: -22` というログは、WSL2がWindows側のGPUを仮想的に認識する初期化プロセスにおいて、**「重要ではない特定の機能（主に映像出力や高度なグラフィックス制御など）」のサポート状況をWindows側に問い合わせた際、「非対応（または無効なリクエスト）」として弾かれた**ことを示す単なるステータス報告だ。

LLM（大規模言語モデル）や音声合成モデルの動作には「純粋な行列計算能力（Compute）」と「VRAM空間」さえ確保できればよく、弾かれたような映像・グラフィックス用の特殊機能は一切使わない。そのため、システム上でこのエラーが出ていてもAIの動作には全く問題がない。

---

#### 詳細なメカニズム解説

なぜこのログが出るのか、そしてなぜAI環境においては完全に無視して良いのかを、OSとハードウェアの挙動から解説する。

##### 1. ログの正体（何が起きているのか？）

* **`misc dxg: dxgk:`**
これはWSL2のLinuxカーネル内に存在する「DirectX Graphics Kernel（dxgkrnl）」というドライバモジュールだ。Windows側にある実際のGPU（RX 9060 XT）と、Linux側を通信させるための仮想的な架け橋（`/dev/dxg`）の役割を果たしている。
* **`dxgkio_query_adapter_info` / `dxgkio_is_feature_enabled**`
これらは「IOCTL（I/O Control）」と呼ばれるシステムコールだ。WSL2が起動してGPUを見つけた瞬間、Linux側からWindows側に向かって「このGPUは描画機能Aを持っているか？ 同期機能Bは使えるか？」と、数十項目にわたるGPUの機能リストを連続して問い合わせる処理を行っている。
* **`Ioctl failed: -22`**
`-22` という数字は、Linuxカーネルのエラーコード `EINVAL` (Invalid argument ＝ 無効な引数) を意味する。つまり、Windows側のグラフィックスドライバが「その機能へのリクエストは無効だ」「この接続環境ではサポートしていない」と返答した状態だ。

##### 2. なぜ「失敗」が起きるのか？

Microsoftが用意したWSL2のGPUブリッジ（GPU-PV）は、純粋な計算だけでなく「LinuxのGUIアプリで高度な3D画面を描画する」ことまで想定して設計されている。そのため、特定の画面描画の最適化機能や、ディスプレイの垂直同期（VSync）に関わるような複雑な機能の有無も片っ端から確認しようとする。

しかし、Radeon等のAMD製GPUであったり、マザーボード直挿しではなくOculink経由の外付け接続をしている場合、Windows側のWDDM（Windows Display Driver Model）が、WSLからのマニアックな描画系機能の問い合わせに対して「対応していない」と突っぱねるケースが多い。これが `-22` の正体だ。

##### 3. なぜLLMやPyTorchで「実害がない」のか？

AI開発においてこのログを完全に無視して良い理由は以下の3点に集約される。

* **AIに必要なのは「Compute（計算）」だけ**
LLMの推論や、今回構築しているIrodori-TTS（PyTorch + ROCm環境）に必要なのは、GPUの「Compute Shader（行列演算などをゴリゴリ処理する計算コア）」と「VRAM（メモリ）」へのアクセス権だけだ。画面にピクセルを描画したり、モニターと同期したりする機能（`-22` で弾かれた機能）は1ミリも使わない。
* **「計算コアの初期化」は成功している**
dxgkrnlドライバは非常に賢く作られている。いくつかの描画機能の問い合わせで `-22` が返ってきても、そこでドライバごとクラッシュすることはない。「機能AとBは使えないな、了解」とカーネルログにメモを残すだけで処理を継続し、AIにとって致命的に重要な「メモリ空間の確保」や「計算コマンドキューの作成」は裏で無事に成功させている。
* **ROCmやCUDAによる抽象化**
PyTorchや背後で動くROCmは、Linuxカーネルが「これは確実に使える」と報告してきた計算用の基本インターフェースだけを使ってGPUに命令を出す。最初から「失敗した機能」にはアクセスしようとしないため、推論中にエラーに巻き込まれることはない。

結論として、このログは「自動車のエンジンは完璧にかかっているが、カーナビの特定のオプション機能がオフになっていることをシステムが起動時にメモした」程度のものだ。RX 9060 XTの計算性能やVRAM 16GBの恩恵には一切の悪影響を与えないため、安心してLLMやTTSを回してくれ。

###  2026/6/23 その２

#### GPU check with WSL2

```bash
uv run python -c "
import torch
print('1. GPU Available:', torch.cuda.is_available())
print('2. Device Count :', torch.cuda.device_count())
if torch.cuda.is_available():
    print('3. Device Name  :', torch.cuda.get_device_name(0))
print('4. HIP Version  :', torch.version.hip)
"
```

#### AMDのROCmリポジトリを追加とインストール

```bash
wget https://repo.radeon.com/rocm/rocm.gpg.key -O - | gpg --dearmor | sudo tee /etc/apt/keyrings/rocm.gpg > /dev/null && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/rocm.gpg] https://repo.radeon.com/rocm/apt/6.1 jammy main" | sudo tee /etc/apt/sources.list.d/rocm.list && sudo apt update && sudo apt install -y rocm-hip-runtime
```

## 
