## Termuxを便利にしたい

### Ollama

```bash:ollama インストール
mkdir -p ~/.local/bin/ && curl -L https://github.com/hhao/ollama/releases/download/v0.1.39/ollama-linux-arm64 -o ~/.local/bin/ollama
chmod +rx ~/.local/bin/ollama
export PATH=~/.local/bin/:${PATH}
```
