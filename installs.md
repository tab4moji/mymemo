## uv

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

### 1. uv の導入
端末で以下のコマンドを順に実行するだけだ。

**インストール**

```bash
sudo apt update && sudo apt install -y pipx && pipx ensurepath && pipx install uv
```

```bash
uv python install 3.12
```

### 2. 使用例

```bash
uv run --with requests,firebase-admin --python 3.12 python ./tools/firestore
```

```bash
uv python install 3.14t
```

### 3. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
```bash
uv cache clean && rm -rf "$(uv python dir)" && rm -rf "$(uv tool dir)" && rm -f ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/uvw && rm -f ~/.cargo/bin/uv ~/.cargo/bin/uvx ~/.cargo/bin/uvw
```
