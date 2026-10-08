## OpenPose

### 使い方

```bash:modelダウンロード
curl -JOL https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors
```

```bash:sd-cli
--control-net ".\models\controlnet-openpose-sdxl-1.0.safetensors" --control-image ".\outputs\openpose.png" --control-strength 0.85
```

### コード

posing.py

```python:posing.py
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "dwpose",
#     "onnxruntime",
#     "Pillow",
#     "matplotlib",
#     "opencv-python-headless",
#     "torch",
#     "scipy",
#     "scikit-image",
#     "huggingface_hub"
# ]
# ///

import argparse
from pathlib import Path
from PIL import Image


def generate_openpose_image(image_path: Path, output_path: Path) -> None:
    if not image_path.exists():
        raise FileNotFoundError(f"Input file not found: {image_path}")

    from dwpose import DwposeDetector

    with Image.open(image_path) as img:
        detector = DwposeDetector.from_pretrained_default()
        # include_face, include_hand, include_body を指定可能
        result_image, keypoints, _ = detector(
            img,
            include_hand=True,
            include_face=False,
            include_body=True,
            image_and_json=True,
            detect_resolution=512,
        )

    result_image.save(output_path, "PNG")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate OpenPose image using DWPose")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("input.jpg"),
        help="Input image file path (default: input.jpg)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("openpose.png"),
        help="Output image file path (default: openpose.png)",
    )
    args = parser.parse_args()

    generate_openpose_image(args.input, args.output)
```
