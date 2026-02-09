## brew

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

### 1. Homebrewの導入 (Install)
端末で以下のコマンドを順に実行するだけだ。

**① インストールスクリプトの実行**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && (echo; echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"') >> ~/.bashrc && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)" && brew doctor
```
※ 途中で `Press RETURN/ENTER to continue` と出たらEnterを押す。パスワードを聞かれたら入力する。
`Your system is ready to brew.` と出れば完了だ。

***

### 2. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**① 公式アンインストールスクリプトの実行**
まず、Homebrew本体とパッケージ管理情報を削除する。
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" && sudo rm -rf /home/linuxbrew && rm -rf ~/.cache/Homebrew && rm -rf ~/.linuxbrew
```
※ 実行中に「本当に消していいか？」と聞かれるので `y` を押して進める。
