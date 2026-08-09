## LiteRT-LM on Windows PWSH (powershell7)

### Gemma4-26B-A4B

```powershell
PS C:\Users\pi> # 仮想環境の作成と有効化
PS C:\Users\pi> python -m venv .venv
PS C:\Users\pi> .\.venv\Scripts\Activate.ps1
(.venv) PS C:\Users\pi\litertlm> litert-lm import `
>>   --from-huggingface-repo=litert-community/gemma-4-26B-A4B-it-litert-lm `
>>   gemma-4-26B-A4B-it-gpu.litertlm `
>>   gemma4-26b-coder
(.venv) PS C:\Users\pi\litertlm> edit C:\Users\pi\.litert-lm\config.json
(.venv) PS C:\Users\pi\litertlm> litert-lm serve --port 11434
```

```json
{
  "default": {
    "backend": "gpu"
  },
  "models": {
    "gemma4-26b-coder": {
      "max_num_tokens": 32768,
      "backend": "gpu"
    }
  }
}
```

##
