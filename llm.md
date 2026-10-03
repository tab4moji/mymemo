## LLM / Embedding ツール・実行基盤のまとめ

主要なLLMツール・実行環境（GUI/CLI）について、内部で動作している推論エンジンと対応するモデルフォーマットを一覧にまとめました。

***

### LLMツール・実行基盤の対応一覧表

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

### 推論コアと対応モデル形式

- [AIツールと推論サーバーの仕組み](./llmtools.png)
- [AIモデル_Transformerの仕組み解説](./llmtools2.png)

| 推論コア（計算エンジン） | 主な対応モデル形式 / 拡張子 | 主な量子化手法・特徴 |
| :--- | :--- | :--- |
| **LiteRT Core**<br>(Google AI Edge)  | **`*.litertlm`**<br>(統合 FlatBuffers コンテナ)  | INT4, INT8, FP16<br>重み・トークナイザー・グラフを単一ファイルに統合  |
| **llama.cpp**  | **`*.gguf`**<br>(GGUF フォーマット)  | k-quants (Q4_K_M, Q8_0 等), IQ quants, FP16<br>CPU/GPU混在オフロードに特化  |
| **vLLM**<br>(PagedAttention)  | **`*.safetensors`**, `*.bin`  | AWQ, GPTQ, BitsAndBytes, FP8, INT4/INT8<br>Hugging Face形式を直接ロード  |
| **SGLang**<br>(RadixAttention / SRT)  | **`*.safetensors`**, `*.bin`  | AWQ, GPTQ, FP8, INT4/INT8<br>キャッシュ共有と高スループットに最適化  |
| **ExLlamaV2**  | **`*.safetensors`**<br>(EXL2 / GPTQ 形式)  | EXL2 (2.0〜8.0 bitの可変ビットレート), GPTQ<br>単一GPUでの超高速デコード  |
| **TensorRT-LLM**<br>(NVIDIA)  | **`*.engine`**<br>(コンパイル済み TRT Engine)  | FP8, NVFP4, INT8/INT4-AWQ, SmoothQuant<br>NVIDIA GPU向け事前最適化バイナリ  |
| **TurboMind**<br>(LMDeploy)  | **`*.safetensors`** / `*.bin`<br>(TurboMind 形式, GGUF)  | W4A16, AWQ, FP8, KV Cache 量子化  |
| **Apple MLX**<br>(mlx-lm)  | **`*.safetensors`**<br>(MLX 形式)  | 4-bit, 8-bit, FP16/BF16<br>Apple Silicon ユニファイドメモリ専用  |
| **ONNX Runtime GenAI** | **`*.onnx`**, `*.onnx.data` | INT4, INT8, FP16<br>DirectML / Windows / NPU 向け共通フォーマット |
| **Apache TVM Relax**<br>(MLC-LLM)  | **`*.bin`**, `*.wasm`<br>(TVM コンパイル済みパッケージ) | q4f16_1, q0f16 等のコンパイル済みウェイト<br>WebGPU / Vulkan 向けクロス実行  |

***

### フォーマット設計の方向性

1. **自己完結コンテナ型（`*.litertlm`, `*.gguf`）**
重みテンソルだけでなく、語彙（トークナイザー定義）、チャットテンプレート、メタデータを1ファイル内に全て抱え込み、外部ライブラリ依存なしで推論パイプラインを起動可能。
2. **非断片化・ストリーム型（`*.safetensors` ベース）**
PyTorch / Hugging Face 互換のウェイトをそのままVRAMにロードし、Pythonランタイム側でトークナイズとKVキャッシュ（PagedAttention等）を制御。
3. **ハードウェア特化コンパイル型（`*.engine`, TVM/ONNX）**
特定のGPUアーキテクチャやNPUに合わせて事前にグラフ融合とカーネル最適化を行い、最高効率で実行するバイナリ形式。

***

### 各モデル形式の特徴と最新動向

#### *.litertlm（LiteRT-LM）
Google AI Edgeが策定したエッジ・オンデバイス向け**コンテナ形式**です。
従来の分散していたTFLiteグラフ、量子化重み（INT4/INT8等）、トークナイザー、チャットテンプレート、NPU向けコンパイル済みバイナリを単一のFlatBufferヘッダー付きファイルに統合しています。ゼロコピーでのメモリマップ展開が可能なため、モバイルや組み込み環境だけでなくPC端末上でもメモリ消費を抑えて起動できます。

#### *.gguf（llama.cpp / Ollama / LM Studio）
コンシューマーPCやCPU/GPU混在環境における事実上の**標準規格**です。
モデルメタデータとテンソル情報を単一ファイルにパッケージングしており、レイヤー単位でVRAMとメインメモリ（RAM）に切り分けて配置するオフロード処理に最も優れています。

#### *.safetensors / EXL2 / AWQ（vLLM / SGLang / ExLlamaV2）
Hugging Faceの標準ウェイト形式を基盤とし、サーバーGPUの高速VRAM上でバッチ処理や高スループット推論を行うための**非断片化形式**です。
特にExLlamaV2のEXL2形式は、テンソルごとに小数ビット単位で量子化深度を変えることで、単一GPUにおける最速クラスのデコード速度を誇ります。

***

### Embedding

- [AI意味計算とベクトルの仕組み](./AI意味計算とベクトルの仕組み.png)
- [AI意味計算とベクトルの仕組み2](./AI意味計算とベクトルの仕組み2.png)

### 主要CLIエージェント比較

| ツール名 | 主導元 / 種別 | バックエンドモデル | 主な特徴・強み |
| :--- | :--- | :--- | :--- |
| **Claude Code** | Anthropic (公式) | Claude Opus / Sonnet  [developersdigest](https://www.developersdigest.tech/blog/claude-opus-5-5-release-guide-2026) | 高度な推論力、コードベース全体の把握、堅牢なGit連携 [ai-tldr](https://ai-tldr.dev/tools/claude-code/)。Node製 [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/) |
| **Antigravity CLI** (`agy`) | Google (公式) | Gemini, Claude等  [developersdigest](https://www.developersdigest.tech/blog/antigravity-vs-cursor-2026) | Google AI Pro枠と連携、Go製で軽量高速、サブエージェント並列管理 [antigravity](https://antigravity.google/) |
| **OpenCode** | Anomaly (OSS) | 任意 (75種以上・ローカル可)  [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/) | ベンダー非依存、LSP統合、Dualエージェント（Build/Plan） [ai-tldr](https://ai-tldr.dev/tools/claude-code/) |
| **Codex CLI** | OpenAI (公式/OSS) | GPT-5.5 / o-series  [taskade](https://www.taskade.com/blog/claude-code-alternatives) | Rust製高速バイナリ、タスク単位実行、MCP・スキル連携 [taskade](https://www.taskade.com/blog/claude-code-alternatives) |
| **Aider** | Paul Gauthier (OSS) | 任意 (Claude, OpenAI, ローカル)  [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/) | Gitコミット自動生成、リポジトリマップによる高精度差分検出 [taskade](https://www.taskade.com/blog/claude-code-alternatives) |
| **Pi** | Armin Ronacher (OSS) | 任意  [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/) | Flask作者による極小構成の次世代エージェントハーネス [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/) |

### 各ツールの特徴と設計思想

#### Claude Code
Anthropicが開発したターミナルネイティブのエージェントツールだ。リポジトリの解析、コード編集、テストの実行、Gitブランチ作成やPR作成までを自然言語の指示で自律的にこなす。モデルにはClaude OpusやSonnetを用い、複雑な複数ファイルにまたがるリファクタリングやバグ追跡に対して高い推論精度を発揮する。 [ai-tldr](https://ai-tldr.dev/tools/claude-code/)

#### Google Antigravity CLI (`agy`)
従来のGemini CLIを刷新・統合して登場したGoogle公式のCLIツールだ。Go言語で書かれた単一バイナリで動作が軽く、Google AI Proなどのサブスクリプション枠を活用してGeminiやClaudeを呼び出せる。バックグラウンドでの複数サブエージェント並列処理やタスクスケジューリング機能が組み込まれている点が特徴だ。 [windowsforum](https://windowsforum.com/news/cve-2026-12537-gemini-cli-0-39-1-fixes-ci-cd-host-code-execution.445782/)

#### OpenCode
特定のプロバイダに縛られないオープンソースのコーディングエージェントだ。GitHubで高い人気を集めており、ClaudeやOpenAIのAPIだけでなく、Ollamaなどを経由したローカルLLMでの推論にも柔軟に対応する。計画を立てる「Planエージェント」と実装を担う「Buildエージェント」を分離して動作させるアーキテクチャを持つ。 [ai-tldr](https://ai-tldr.dev/tools/claude-code/)

#### OpenAI Codex CLI
OpenAIが提供するRust製のターミナル向けエージェントだ。推論モデル（Reasoning model）を基盤にしており、シェルコマンドの自動実行、テスト駆動の修正、MCP（Model Context Protocol）サーバーとの連携をサポートしている。 [taskade](https://www.taskade.com/blog/claude-code-alternatives)

#### Aider および Pi
- **Aider**: CLIエージェントの先駆け的存在で、リポジトリマップ機能によりトークン消費を抑えつつ正確な編集パッチを当てる。変更ごとに自動で的確なGitコミットメッセージを残す運用に長けている。
- **Pi**: 軽量さを突き詰めたミニマルなエージェントハーネスで、外部プロセスとの連携やフック処理を自分でカスタマイズしたいハッカー向けの設計になっている。 [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/)

### 選定の判断基準

- **単一タスクの修正精度とリファクタリング**: Claude Codeを優先するのが手堅い。 [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/)
- **Google環境や定額枠の活用**: Google AI Proの枠が使える環境ならAntigravity CLIのコスト効率が高い。 [windowsforum](https://windowsforum.com/news/cve-2026-12537-gemini-cli-0-39-1-fixes-ci-cd-host-code-execution.445782/)
- **ローカルモデルや完全な制御**: 外部API縛りを避け、ローカルLLMや手元のGPU資源を併用するならOpenCodeかAiderが最適解になる。 [pinggy](https://pinggy.io/blog/top_cli_based_ai_coding_agents/)

##
