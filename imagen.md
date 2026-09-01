## 画像生成AI

- [leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp)

### stable-diffusion.cpp セットアップ

```bash
SD_MASTER_CORE="841"
SD_MASTER_VERSION="6b3edaa"

if [[ ! -e sd-master-${SD_MASTER_VERSION}-bin-win-vulkan-x64.zip ]]
then
    \curl -L https://github.com/leejet/stable-diffusion.cpp/releases/download/master-${SD_MASTER_CORE}-${SD_MASTER_VERSION}/sd-master-${SD_MASTER_VERSION}-bin-win-vulkan-x64.zip -o sd-master-${SD_MASTER_VERSION}-bin-win-vulkan-x64.zip
fi

if [[ -e sd-master-${SD_MASTER_VERSION}-bin-win-vulkan-x64.zip ]]
then
    unzip sd-master-${SD_MASTER_VERSION}-bin-win-vulkan-x64.zip
fi
```

### stable-diffusion.cpp で画像を生成する

#### 写真的な画像を生成

```bash:写真
pwsh 'cd '"$(wslpath -w "$(pwd)")"'; $env:GGML_VK_VISIBLE_DEVICES = "1"; .\sd-cli.exe -m ".\picture_model.safetensors" -p "score_9, score_8_up, score_7_up, an apple on a table on grass, highly detailed" -n "score_4, score_3, score_2, score_1, source_anime, source_cartoon, source_furry, source_pony, plastic skins, 3d, cgi, render, drawing, illustration" --cfg-scale 6 --steps 28 -W 832 -H 1216 -s -1 -o "sample_output.png"'
```

#### 画像の中の指定したものを置き換え

- apples
- many grapes

```python:generate_mask.py
"""
目的と機能:
  入力画像とプロンプトから、sd-cliが確実に解釈できる完全なアセット
  (64の倍数サイズにリサイズされた init_img.png と mask.png) を生成する。
  マスクのエッジを自動膨張(Dilation)させて下着の輪郭残りを完全に消す。

更新履歴:
  No.1 (2026-09-01): 新規作成。
"""

import argparse
import sys
import torch
import numpy as np
from PIL import Image, ImageFilter
from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor


def select_execution_device() -> torch.device:
    """利用可能な最適なデバイスを選択して返す。"""
    target_device = torch.device("cpu")
    if torch.cuda.is_available():
        target_device = torch.device("cuda")
    else:
        try:
            import torch_directml
            if torch_directml.is_available():
                target_device = torch_directml.device()
        except ImportError:
            pass
    return target_device


def round_to_multiple(val: int, multiple: int = 64) -> int:
    """数値を指定の倍数（64）に丸める。"""
    return (val // multiple) * multiple


def process_perfect_assets(
    image_path: str,
    prompt: str,
    mask_output_path: str,
    init_output_path: str,
    threshold: float = 0.35,
    dilate_radius: int = 4,
) -> None:
    """64倍数アライメント・RGBマスク・膨張処理を適用したアセットを出力する。"""
    device = select_execution_device()

    try:
        raw_image = Image.open(image_path).convert("RGB")
    except Exception as err:
        raise IOError(f"入力画像の読み込み失敗: {err}") from err

    # 1. 64の倍数に解像度をアライメント
    aligned_w = round_to_multiple(raw_image.width, 64)
    aligned_h = round_to_multiple(raw_image.height, 64)
    init_image = raw_image.resize((aligned_w, aligned_h), Image.Resampling.LANCZOS)

    try:
        init_image.save(init_output_path, format="PNG")
    except Exception as err:
        raise IOError(f"init画像の保存失敗: {err}") from err

    # 2. CLIPSegによるセグメンテーション
    model_id = "CIDAS/clipseg-rd64-refined"
    try:
        processor = CLIPSegProcessor.from_pretrained(model_id)
        model = CLIPSegForImageSegmentation.from_pretrained(model_id).to(device)
    except Exception as err:
        raise RuntimeError(f"モデルロード失敗: {err}") from err

    inputs = processor(
        text=[prompt],
        images=[init_image],
        padding="max_length",
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    preds = outputs.logits.unsqueeze(0)
    mask_tensor = torch.sigmoid(preds[0][0])
    binary_mask = (mask_tensor > threshold).float().cpu().numpy() * 255.0

    mask_l = Image.fromarray(binary_mask.astype("uint8")).resize(
        (aligned_w, aligned_h), resample=Image.Resampling.BILINEAR
    )

    # 3. 下着のフチを取り残さないためのマスク膨張 (Dilation)
    if dilate_radius > 0:
        mask_l = mask_l.filter(ImageFilter.MaxFilter(dilate_radius * 2 + 1))

    # 4. sd-cliが確実に読み込めるようRGB 3ch PNGに変換して保存
    mask_rgb = mask_l.convert("RGB")
    try:
        mask_rgb.save(mask_output_path, format="PNG")
    except Exception as err:
        raise IOError(f"マスク画像の保存失敗: {err}") from err

    return None


def main() -> None:
    """CLI引数を処理して実行する。"""
    parser = argparse.ArgumentParser(description="Perfect asset generator for sd-cli")
    parser.add_argument("-i", "--input", required=True, help="入力画像パス")
    parser.add_argument("-p", "--prompt", required=True, help="マスク対象テキスト")
    parser.add_argument("--output-mask", default="mask.png", help="出力マスクパス")
    parser.add_argument("--output-init", default="init_img.png", help="出力init画像パス")
    parser.add_argument("-t", "--threshold", type=float, default=0.35, help="閾値")
    parser.add_argument(
        "-d", "--dilate", type=int, default=4, help="マスク膨張量(px)"
    )
    args = parser.parse_args()

    try:
        process_perfect_assets(
            image_path=args.input,
            prompt=args.prompt,
            mask_output_path=args.output_mask,
            init_output_path=args.output_init,
            threshold=args.threshold,
            dilate_radius=args.dilate,
        )
    except Exception as err:
        sys.stderr.write(f"エラー: {err}\n")
        sys.exit(1)

    return None

if __name__ == "__main__":
    main()
```

```bash:置き換え
pwsh 'cd '"$(wslpath -w "$(pwd)")"'; $env:GGML_VK_VISIBLE_DEVICES = "1"; uv run --python 3.12 --with pillow --with torch --with torchvision --with transformers generate_mask.py --input sample_output.png --prompt "apples" --output-mask mask.png --output-init init_img.png -t 0.35 -d 5; .\sd-cli.exe -M img_gen -m ".\picture_model.safetensors" --mask mask.png --init-img init_img.png --strength 1.00 -p "many grapes, higly detailed, high quality, photorealistic" -n "low quality, blurry, 3d, cgi, deformed, bad anatomy" --cfg-scale 4.0 --steps 25 --sampling-method dpm++2m -o "sample_output_changed.png"'
```

##
