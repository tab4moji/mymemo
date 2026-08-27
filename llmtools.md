主要なLLMツール・実行環境（GUI/CLI）について、内部で動作している推論エンジンと対応するモデルフォーマットを一覧にまとめました 。

***

## LLMツール・実行基盤の対応一覧表

| ツール / 実行基盤 | 形態 | 内部の推論エンジン（計算コア） | 対応している推論モデル形式 |
| :--- | :--- | :--- | :--- |
| **LiteRT-LM** | CLI / ランタイム | Google LiteRT Core | `*.litertlm`（統合コンテナ） |
| **Ollama** | CLI / APIサーバー  | llama.cpp  | GGUF (`*.gguf`)  |
| **LM Studio** | GUI / CLI (`lms`)  | llama.cpp / Apple MLX  | GGUF (`*.gguf`), MLX形式  |
| **llama.cpp** | CLI / Server  | llama.cpp（ネイティブ）  | GGUF (`*.gguf`)  |
| **vLLM** | CLI / Python Server  | vLLM (PagedAttention)  | Safetensors (`*.safetensors`), AWQ, GPTQ, FP8  |
| **SGLang** | CLI / Python Server  | SGLang (RadixAttention)  | Safetensors (`*.safetensors`), AWQ, GPTQ, FP8  |
| **ExLlamaV2** | CLI / Server / Lib  | ExLlamaV2（ネイティブ）  | EXL2 (`*.safetensors`), GPTQ  |
| **TensorRT-LLM** | CLI / C++ Server  | NVIDIA TensorRT-LLM  | TRT Engine (`*.engine`), FP8/NVFP4  |
| **Jan** | GUI デスクトップ  | Cortex.cpp (llama.cpp派生) / TensorRT  | GGUF (`*.gguf`), TensorRT Engine  |
| **Aphrodite Engine** | CLI / Python Server  | vLLMコア + ExLlamaV2 / llama.cpp  | Safetensors, AWQ, GPTQ, EXL2, GGUF  |
| **ONNX Runtime GenAI** | CLI / ライブラリ | ONNX Runtime (DirectML / CUDA) | ONNX (`*.onnx`, `*.onnx.data`) |
| **MLC-LLM** | CLI / Web / API  | Apache TVM Relax  | MLC形式 (`*.bin`, `*.wasm`, `*.json`) |
| **LMDeploy** | CLI / Server  | TurboMind / PyTorch  | TurboMind (`*.safetensors`), AWQ, W4A16, GGUF  |
| **mlx-lm** | CLI / Python Lib  | Apple MLX（ネイティブ）  | MLX Safetensors (`*.safetensors`)  |

***

## 各モデル形式の特徴と最新動向

### *.litertlm（LiteRT-LM）
Google AI Edgeが策定したエッジ・オンデバイス向け**コンテナ形式**です 。 
従来の分散していたTFLiteグラフ、量子化重み（INT4/INT8等）、トークナイザー、チャットテンプレート、NPU向けコンパイル済みバイナリを単一のFlatBufferヘッダー付きファイルに統合しています 。ゼロコピーでのメモリマップ展開が可能なため、モバイルや組み込み環境だけでなくPC端末上でもメモリ消費を抑えて起動できます 。 

### *.gguf（llama.cpp / Ollama / LM Studio）
コンシューマーPCやCPU/GPU混在環境における事実上の**標準規格**です 。 
モデルメタデータとテンソル情報を単一ファイルにパッケージングしており、レイヤー単位でVRAMとメインメモリ（RAM）に切り分けて配置するオフロード処理に最も優れています 。

### *.safetensors / EXL2 / AWQ（vLLM / SGLang / ExLlamaV2）
Hugging Faceの標準ウェイト形式を基盤とし、サーバーGPUの高速VRAM上でバッチ処理や高スループット推論を行うための**非断片化形式**です 。 
特にExLlamaV2のEXL2形式は、テンソルごとに小数ビット単位で量子化深度を変えることで、単一GPUにおける最速クラスのデコード速度を誇ります 。 

***

## 併用環境における運用のポイント

現在運用されている **Ollama** と **LiteRT-LM** は、フォーマットと内部構造の住み分けが非常に明快です 。 

- **Ollama（GGUF）**：Hugging Faceコミュニティが公開する膨大なモデルや量子化バリアントを即座に試す用途に向いています 。
- **LiteRT-LM（.litertlm）**：Gemma 4などのGoogle系モデルやオンデバイス特化モデルにおいて、トークナイザーや推論パイプラインが完全に固定化・最適化された状態での軽量・安定動作に向いています 。 
