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
pwsh 'cd '"$(wslpath -w "$(pwd)")"'; $env:GGML_VK_VISIBLE_DEVICES = "1"; .\sd-cli.exe -m ".\image_generation_model.safetensors" -p "score_9, score_8_up, score_7_up, an apple on a table on grass, highly detailed" -n "score_4, score_3, score_2, score_1, source_anime, source_cartoon, source_furry, source_pony, plastic skins, 3d, cgi, render, drawing, illustration" --cfg-scale 6 --steps 28 -W 832 -H 1216 -s -1 -o "sample_output.png"'
```

#### 画像の中の指定したものを置き換え

- apples
- many grapes

```bash:置き換え
pwsh 'cd '"$(wslpath -w "$(pwd)")"'; $env:GGML_VK_VISIBLE_DEVICES = "1"; uv run --python 3.12 --with pillow --with torch --with torchvision --with transformers generate_mask.py --input sample_output.png --prompt "apples" --output-mask mask.png --output-init init_img.png -t 0.35 -d 5; .\sd-cli.exe -M img_gen -m ".\kawaiiRealisticAsian_v02.safetensors" --mask mask.png --init-img init_img.png --strength 1.00 -p "many grapes, higly detailed, high quality, photorealistic" -n "low quality, blurry, 3d, cgi, deformed, bad anatomy" --cfg-scale 4.0 --steps 25 --sampling-method dpm++2m -o "sample_output_changed.png"'
```

##
