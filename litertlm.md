## LiteRT-LM on Windows PWSH (powershell7)

[LiteRT-LM](https://developers.google.com/edge/litert-lm) は、たぶんスマホ向けに作られた [TenrsorFlow Lite](https://www.tensorflow.org/lite/guide)(TFLite) 系の推論エンジン。

### 推論エンジンをインストールする

[LiteRT-LM CLI](https://pypi.org/project/litert-lm/) をインストールする。

```powershell:念のためvenvセットアップ
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

```powershell:セットアップ
python -m pip install -U pip litert-lm
```

#### 推論エンジンを起動する

```powershell:念のためvenv
.\.venv\Scripts\Activate.ps1
```

```powershell:推論エンジンをポート11434で受ける前提で起動
litert-lm serve --port 11434
```

### LiteRT-LM 用の推論モデル

LiteRT-LM 推論エンジンでは、[Hugging Face](https://huggingface.co/) で公開されている [litert-lm モデル](https://huggingface.co/models?library=litert-lm&sort=modified) を使える。

#### Gemma4-26B-A4B

Gemma4-26B-A4B をインポートする。

```powershell:Gemma4-26B-A4B
litert-lm import ` --from-huggingface-repo=litert-community/gemma-4-26B-A4B-it-litert-lm ` gemma-4-26B-A4B-it-gpu.litertlm ` gemma4-26b-a4b
```

```powershell
edit C:\Users\pi\.litert-lm\config.json
```

```json
{
  "default": {
    "backend": "gpu"
  },
  "models": {
    "gemma4-26b-a4b": {
      "max_num_tokens": 32768,
      "backend": "gpu"
    }
  }
}
```

##
