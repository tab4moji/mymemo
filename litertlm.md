## LiteRT-LM on Windows PWSH (powershell7)

### Gemma4-26B-A4B

#### セットアップ

```powershell:セットアップ
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

```powershell:セットアップ
python -m pip install -U pip litert-lm
litert-lm import ` --from-huggingface-repo=litert-community/gemma-4-26B-A4B-it-litert-lm ` gemma-4-26B-A4B-it-gpu.litertlm ` gemma4-26b-a4b
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

#### Gemma4 起動

```powershell:Gemma4 起動
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

```powershell:Gemma4 起動
litert-lm serve --port 11434
```

##
