## LiteRT-LM on Windows with pwsh (powershell7)

たぶん bash でも同じ。
[LiteRT-LM](https://developers.google.com/edge/litert-lm) は、たぶんスマホ向けに作られた [TenrsorFlow Lite](https://www.tensorflow.org/lite/guide)(TFLite) 系の推論エンジン。

### 推論エンジンをインストールする

[LiteRT-LM CLI](https://pypi.org/project/litert-lm/) をインストールする。
たぶん [OpenAI 互換](https://developers.google.com/edge/litert-lm/cli/openai_server) API。
これが[説明書](https://developers.google.com/edge/litert-lm/cli)。

素の pip は面倒くさいので [uv](./?content=pwsh#wvE9oadP) を使う。

```powershell:インストール
uv pip install --upgrade pip litert-lm
```

### LiteRT-LM 用の推論モデル

LiteRT-LM 推論エンジンで [Hugging Face](https://huggingface.co/) で公開されている [litert-lm モデル](https://huggingface.co/models?library=litert-lm&sort=modified) を使える。

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

### 推論エンジンを起動する

```powershell:念のためvenv
.\.venv\Scripts\Activate.ps1
```

```powershell:推論エンジンをポート11434で受ける前提で起動
litert-lm serve --port 11434
```

### 推論エンジンを停止する

たぶん、*CTRL-C を長め*に押すと止まる。

### 推論エンジンをアンインストール

記載中。

```powershell:アンインストール
uv pip uninstall litert-lm
uv cache prune
```

##
