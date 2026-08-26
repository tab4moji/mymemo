## 画像生成

### サンプル

アニメ生成

```powershell
.\sd-cli.exe -m ".\ponyDiffusionV6XL_v6StartWithThisOne.safetensors" --backend vulkan1 --vae-tiling -p "score_9, score_8_up, score_7_up, rating_safe, source_anime, 1girl, child, cute young girl, blue hair, short hair, bob cut, blue eyes, slight smile, blush, cream-colored hair ribbon on top of head, cream sailor dress, short puff sleeves, sailor collar, pale green bow on chest, retro anime, storybook illustration, vintage pastel aesthetic, soft lighting, warm tone, textured paper, masterpiece, highly detailed" -n "score_4, score_3, score_2, score_1, source_real, source_pony, photo, 3d, realistic, adult, sexy, mature, dark lighting, gradient, modern digital, sharp digital, deformed, bad anatomy, bad hands" --cfg-scale 7.0 --steps 28 -W 832 -H 1216 -s 15140 -o "output_anime3_sameas2.png"
```
