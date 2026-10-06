## Anima

Windows 11 + RX 9060 XT（Oculink）環境において、ComfyUIを使わずpwshからAnima-Aestheticによる同一人物画像生成を回すための完全セットアップ手順だ。

### 1. ディレクトリとモデル取得（pwsh）

プロジェクトルートを作成し、公式の `anima-aesthetic-v1.1.safetensors` をダウンロードする。

```powershell
mkdir ~/anima-pipeline
cd ~/anima-pipeline
mkdir config, models, outputs, scripts

# 公式 Anima-Aesthetic v1.1 のダウンロード
cd models
curl.exe -JOL https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-aesthetic-v1.1.safetensors
cd ..
```

***

### 2. 仮想環境と依存パッケージの導入

TheRock のマルチアーキテクチャ ROCm wheel を入れ、不具合を起こす `torchaudio` を除外した構成を組む。

```powershell
uv venv --python 3.12 .venv

# ROCm 対応 PyTorch 群の導入
uv pip install `
  --python .\.venv\Scripts\python.exe `
  --index-url https://rocm.nightlies.amd.com/whl-multi-arch/ `
  "torch[device-all]" "torchvision[device-all]"

# Diffusers 関連ツールの導入（torchaudio は入れない）
uv pip install `
  --python .\.venv\Scripts\python.exe `
  diffusers `
  transformers `
  accelerate `
  safetensors `
  huggingface_hub `
  pyyaml `
  pillow `
  numpy
```

***

### 3. 設定ファイル（`config/character.yaml`）

キャラクターの外見特徴をアンカーとして固定し、2つの異なるシチュエーション（カジュアルとフォーマル）を定義する。

```yaml
# config/character.yaml
character_id: "ren_01"

# 同一人物固定のためのベース特徴（顔・髪・瞳・固有パーツ）
base_prompt: >-
  1girl, ren_01, solo, masterpiece, highly detailed,
  sharp amber eyes, long dark navy hair, twin braided tails,
  straight blunt bangs, small beauty mark under left eye, slender build

negative_prompt: >-
  worst quality, low quality, score_1, score_2, score_3,
  blurry, deformed, bad anatomy, multiple girls, mutated hands

scene_templates:
  casual_park:
    prompt: >-
      sitting on a wooden bench in an autumn park, oversized cream hoodie,
      blue denim skirt, holding a warm paper coffee cup, soft daylight, depth of field
    seed: 42
    steps: 30
    cfg: 4.5
    width: 832
    height: 1216

  formal_evening:
    prompt: >-
      standing on a luxury hotel balcony at night, elegant black evening dress,
      silver necklace, looking at viewer, gentle smile, city lights bokeh background
    seed: 42
    steps: 30
    cfg: 4.5
    width: 832
    height: 1216
```

***

### 4. 生成スクリプト（`scripts/generate.py`）

骨格（Qwen3テキストエンコーダ + VAE）をDiffusersリポジトリから取得し、推論パイプラインを駆動する。

```python
#!/usr/bin/env python
"""Anima-Aesthetic 同一人物画像生成スクリプト.

001 - 2026-10-06: 新規作成。キャラ定義注入によるループ生成処理.
"""

from pathlib import Path
import sys
from diffusers import DiffusionPipeline
import torch
import yaml

MODEL_ID = "CalamitousFelicitousness/Anima-1.0-Aesthetic-Diffusers"
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_PATH = PROJECT_ROOT / "config" / "character.yaml"
OUTPUT_DIR = PROJECT_ROOT / "outputs"


def load_configuration(path: Path) -> dict:
    """YAML設定ファイルを検証して読み込む."""
    if not path.is_file():
        raise FileNotFoundError(f"Configuration file missing: {path}")

    with path.open("r", encoding="utf-8") as stream:
        config_data = yaml.safe_load(stream)

    if not isinstance(config_data, dict):
        raise ValueError("Invalid YAML structure: root must be a mapping")

    return config_data


def build_pipeline(model_id: str) -> DiffusionPipeline:
    """ROCm GPU向け推論パイプラインを構築する."""
    if not torch.cuda.is_available():
        raise RuntimeError("ROCm GPU is not available in current environment")

    pipe = DiffusionPipeline.from_pretrained(
        model_id,
        custom_pipeline=model_id,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
    return pipe.to("cuda")


def execute_generation(
    pipe: DiffusionPipeline, config: dict
) -> list[Path]:
    """設定に従い2枚の画像を順次生成する."""
    char_id = config["character_id"]
    base_prompt = config["base_prompt"]
    neg_prompt = config["negative_prompt"]
    scenes = config["scene_templates"]
    results = []

    for name, params in scenes.items():
        prompt = f"{base_prompt}, {params['prompt']}"
        gen = torch.Generator("cuda").manual_seed(params["seed"])

        output = pipe(
            prompt=prompt,
            negative_prompt=neg_prompt,
            num_inference_steps=params["steps"],
            guidance_scale=params["cfg"],
            width=params["width"],
            height=params["height"],
            generator=gen,
        )

        image_path = OUTPUT_DIR / f"{char_id}_{name}.png"
        output.images[0].save(image_path)
        results.append(image_path)

    return results


def main() -> int:
    """メイン実行エントリポイント."""
    exit_code = 0
    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        config = load_configuration(CONFIG_PATH)
        pipeline = build_pipeline(MODEL_ID)
        saved_files = execute_generation(pipeline, config)

        for item in saved_files:
            sys.stdout.write(f"Generated: {item}\n")

    except Exception as exc:
        sys.stderr.write(f"Execution Error: {exc}\n")
        exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
```

***

### 5. 実行スクリプト（`run.ps1`）

内蔵GPU（Radeon 680M）をスキップし、外付け RX 9060 XT（デバイス 1）を明示的に指定して叩く起動ファイルだ。

```powershell
# run.ps1
$env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"
$env:HIP_VISIBLE_DEVICES = "1"
$env:ROCR_VISIBLE_DEVICES = "1"
$env:TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL = "1"

.\.venv\Scripts\python.exe .\scripts\generate.py
```

#### 実行コマンド

```powershell
.\run.ps1
```

初回実行時のみ Diffusers パイプライン構成要素（約 5GB）が自動キャッシュされ、完了すると `outputs/ren_01_casual_park.png` と `outputs/ren_01_formal_evening.png` に同一人物のシチュエーション差分が約 12〜13 秒/枚 で生成される。

##### サンプル
- [./suama_01.png](./suama_01.png)
- [./suama_02.png](./suama_02.png)
