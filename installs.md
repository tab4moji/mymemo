## セットアップ

### brew

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

#### 1. Homebrewの導入 (Install)
端末で以下のコマンドを順に実行するだけだ。

**インストール**
```bash
brew doctor || { NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; sudo -E apt update -y && sudo -E apt full-upgrade -y && sudo -E apt install build-essential -y && brew doctor; }
```
`Your system is ready to brew.` と出れば完了だ。

**インストール pipx **

```bash:pipx ってなんだ？
sudo apt install -y pipx && pipx ensurepath && pipx install uv
```

```bash:動作ログ
pi@raspberrypi:~$
pi@raspberrypi:~$ sudo apt install -y pipx
pipx ensurepath
pipx install uv
Installing:
  pipx

Installing dependencies:
  python3-argcomplete  python3-userpath

推奨パッケージ:
  python3-psutil

Summary:
  Upgrading: 0, Installing: 3, Removing: 0, Not Upgrading: 0
  Download size: 880 kB
  Space needed: 4,016 kB / 18.2 GB available

取得:1 http://deb.debian.org/debian trixie/main arm64 python3-argcomplete all 3.6.2-1 [40.9 kB]
取得:2 http://deb.debian.org/debian trixie/main arm64 python3-userpath all 1.9.2-1 [10.3 kB]
取得:3 http://deb.debian.org/debian trixie/main arm64 pipx all 1.7.1-1 [828 kB]
880 kB を 1秒 で取得しました (1,649 kB/s)
以前に未選択のパッケージ python3-argcomplete を選択しています。
(データベースを読み込んでいます ... 現在 144114 個のファイルとディレクトリがインストールされています。)
.../python3-argcomplete_3.6.2-1_all.deb を展開する準備をしています ...
python3-argcomplete (3.6.2-1) を展開しています...
以前に未選択のパッケージ python3-userpath を選択しています。
.../python3-userpath_1.9.2-1_all.deb を展開する準備をしています ...
python3-userpath (1.9.2-1) を展開しています...
以前に未選択のパッケージ pipx を選択しています。
.../archives/pipx_1.7.1-1_all.deb を展開する準備をしています ...
pipx (1.7.1-1) を展開しています...
python3-argcomplete (3.6.2-1) を設定しています ...
python3-userpath (1.9.2-1) を設定しています ...
pipx (1.7.1-1) を設定しています ...
man-db (2.13.1-1) のトリガを処理しています ...
/home/pi/.local/bin is already in PATH.

⚠️  All pipx binary directories have been appended to PATH. If you are sure you want to proceed, try again with the '--force' flag.

Otherwise pipx is ready to go! ✨ 🌟 ✨
  installed package uv 0.12.7, installed using Python 3.13.5
  These apps are now globally available
    - uv
    - uvx
done! ✨ 🌟 ✨
pi@raspberrypi:~$
```

#### 2. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
まず、Homebrew本体とパッケージ管理情報を削除する。
```bash
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" && sudo rm -rf /home/linuxbrew && rm -rf ~/.cache/Homebrew && rm -rf ~/.linuxbrew
```
※ 実行中に「本当に消していいか？」と聞かれるので `y` を押して進める。

***

### uv

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

#### 1. uvの導入 (Install)
端末で以下のコマンドを順に実行するだけだ。

**インストール**
```bash
uv --version || { NONINTERACTIVE=1 /bin/bash -c "$(curl -LsSf https://astral.sh/uv/install.sh)"; }
```

#### 2. 使用例
```bash
uv python install 3.14t
```

#### 3. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
```bash
uv cache clean && rm -rf "$(uv python dir)" && rm -rf "$(uv tool dir)" && rm -f ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/uvw && rm -f ~/.cargo/bin/uv ~/.cargo/bin/uvx ~/.cargo/bin/uvw
```
