## Irodori-TSS

Windows 環境で AMD GPU（内蔵GPU / Radeon）を使用し、ROCm を介して Irodori-TTS をセットアップする手順です。

### 1. Python バージョンと設定の準備

リポジトリルート（`Irodori-TTS`）で Python 3.12 を指定し、Python 3.12 用のビルド済みパッケージを利用できるように `pyproject.toml` の `sentencepiece` を更新します 。

```powershell
# Python 3.12 をプロジェクトに固定
uv python pin 3.12

# sentencepiece の依存バージョンを 0.2.0 以上に書き換え
(Get-Content pyproject.toml) -replace 'sentencepiece.*', '"sentencepiece>=0.2.0",' | Set-Content pyproject.toml
```

***

### 2. 依存関係の同期と ROCm 版 PyTorch の導入

基本ライブラリを同期した後、AMD 公式の nightly インデックスから ROCm 版 PyTorch を強制上書きインストールします 。

```powershell
# プロジェクトの基本依存パッケージを同期
uv sync

# ROCm 版 PyTorch および torchaudio をインストール
uv pip install --force-reinstall --extra-index-url https://rocm.nightlies.amd.com/whl-multi-arch/ "torch[device-all]" torchaudio
```

***

### 3. 音声合成の実行

必要な環境変数を定義した上で、`--no-sync` を付与して推論を実行します 。

```powershell
# AMD GPU 認識用の環境変数を設定
$env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"
$env:HIP_VISIBLE_DEVICES = "0,1"
$env:ROCR_VISIBLE_DEVICES = "0,1"

# 音声合成を実行
uv run --no-sync python infer.py `
  --hf-checkpoint Aratako/Irodori-TTS-v4.1-Small `
  --model-device cuda:0 `
  --codec-device cpu `
  --model-precision fp32 `
  --text "こんにちは、これは音声合成テストです。" `
  --no-ref `
  --output-wav outputs/sample.wav
```

### デバイス指定と運用の要点

- **GPU の使い分け**: `--model-device cuda:0` で内蔵GPU（Radeon Graphics）、`--model-device cuda:1` でディスクリートGPU（RX 9060 XT）が選択されます。
- **同期の防止**: `uv run` 実行時に `--no-sync` を必ず付与してください。省略すると通常の CPU 版 PyTorch に自動ロールバックされます。
- **ターミナル再起動時**: 新しい PowerShell ウィンドウを開いた場合は、推論前に `$env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"` などの環境変数を再度設定する必要があります。
