# Antigravity CLI

## インストール

```bash:agycliインストール
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

## アンインストール

専用のアンインストーラーは用意されていない。CLI 内で `/logout` して認証情報を消したあと、バイナリと設定フォルダを手動で削除すればきれいさっぱり消える。

### 共通の事前準備

バイナリを消す前に `agy` を起動して `/logout` を実行しておけ。これで Windows 資格情報マネージャーや Linux のキーリングに保存された認証トークンが削除される。

### Windows 11 の削除手順

PowerShell でバイナリと設定ディレクトリを削除する。

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\agy"
Remove-Item -Recurse -Force "$env:USERPROFILE\.gemini\antigravity-cli"
```

最後に Windows のユーザー環境変数 `Path` に追加された `C:\Users\<ユーザー名>\AppData\Local\agy\bin` を消しておけば完了だ。

### Linux（UserLAnd Ubuntu）の削除手順

ターミナルでバイナリと設定ディレクトリを削除する。

```bash
rm -f ~/.local/bin/agy
rm -rf ~/.gemini/antigravity-cli
```

インストーラーが `~/.bashrc` などに `~/.local/bin` の `PATH` 追記を行っていた場合、不要ならその行も削っておくといい。単体バイナリ構成なので、システム側を汚す心配はほぼない。
