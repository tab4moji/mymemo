## 画像生成

### セットアップ

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

### 画像生成サンプル

```bash
pwsh 'cd '"$(wslpath -w "$(pwd)")"'; $env:GGML_VK_VISIBLE_DEVICES = "1"; .\sd-cli.exe -m ".\image_generation_model.safetensors" -p "score_9, score_8_up, score_7_up, an apple on a table on grass, highly detailed" -n "score_4, score_3, score_2, score_1, source_anime, source_cartoon, source_furry, source_pony, plastic skins, 3d, cgi, render, drawing, illustration" --cfg-scale 6 --steps 28 -W 832 -H 1216 -s -1 -o "sample_output.png"'
```
