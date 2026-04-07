## セットアップ

### brew

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

#### 1. Homebrewの導入 (Install)
端末で以下のコマンドを順に実行するだけだ。

**① インストール**
```bash
brew doctor || { NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; sudo -E apt update -y && sudo -E apt full-upgrade -y && sudo -E apt install build-essential -y && brew doctor; }
```
`Your system is ready to brew.` と出れば完了だ。

***

#### 2. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
まず、Homebrew本体とパッケージ管理情報を削除する。
```bash
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" && sudo rm -rf /home/linuxbrew && rm -rf ~/.cache/Homebrew && rm -rf ~/.linuxbrew
```
※ 実行中に「本当に消していいか？」と聞かれるので `y` を押して進める。


### uv

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

#### 1. uvの導入 (Install)
端末で以下のコマンドを順に実行するだけだ。

**① インストール**
```bash
uv --version || { NONINTERACTIVE=1 /bin/bash -c "$(curl -LsSf https://astral.sh/uv/install.sh)"; }
```

***

#### 2. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
```bash
uv cache clean && rm -rf "$(uv python dir)" && rm -rf "$(uv tool dir)" && rm -f ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/uvw && rm -f ~/.cargo/bin/uv ~/.cargo/bin/uvx ~/.cargo/bin/uvw
```
