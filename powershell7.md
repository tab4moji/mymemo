## Powershell 7 (pwsh.exe) を便利にしたい

### Administratorなのかどうか

Admin権限なら True

```powershell
[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

### Upgrade

```powershell:広く公開されたら
winget upgrade --id Microsoft.PowerShell --source winget
```

他の方法だと、ウィンドウ操作で対応。

### Emacs風シェルにしたい

#### プロファイル作成 & 編集コマンド

```powershell
PowerShell 7.5.4
PS C:\> edit $PROFILE
Error 0x80070003: 謖・ｮ壹＆繧後◆繝代せ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・
PS C:\>
```

```powershell
# 1. プロファイル用のフォルダが無ければ作る
if (!(Test-Path (Split-Path $PROFILE))) { New-Item -ItemType Directory -Force -Path (Split-Path $PROFILE) }

# 2. ファイルが無ければ空っぽのものを作る
if (!(Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force }

# 3. メモ帳で開く
notepad $PROFILE
```

#### プロファイルの内容

pwsh に直接貼り付けても良し。

```powershell
# =============================================================================
# Linux/Emacs Style Keybindings for PowerShell
# Updated: 2026-01-19 (Fixed Ctrl+D)
# =============================================================================

Import-Module PSReadLine -ErrorAction SilentlyContinue

# Emacsモード有効化
# これだけで Ctrl+A/E/K/U/P/N... そして "Ctrl+D" も自動的にLinux風になる
Set-PSReadLineOption -EditMode Emacs

# --- 予測入力の設定 ---
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle Inline

# --- TAB / CTRL+I の挙動設定 ---
# 予測が出ていれば「右矢印(確定)」、なければ「通常のTab補完」
$TabAction = {
    param($key, $arg)

    $line = $null
    $cursor = $null
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

    # 1. カーソルが行末かつ予測がある場合 -> 予測を受け入れる
    if ($cursor -eq $line.Length) {
        $before = $line
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptSuggestion()
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
        if ($before -ne $line) { return }
    }

    # 2. それ以外 -> 通常のTab補完
    [Microsoft.PowerShell.PSConsoleReadLine]::TabCompleteNext()
}

# キー割り当て (Tab と Ctrl+I を共通化)
Set-PSReadLineKeyHandler -Key "Tab"    -ScriptBlock $TabAction
Set-PSReadLineKeyHandler -Key "Ctrl+i" -ScriptBlock $TabAction


# =============================================================================
# My Aliases
# =============================================================================

function python { uv run python $args }
function python3 { uv run python $args }

function ll { Get-ChildItem -Force -Verbose $args }
function la { Get-ChildItem -Force $args }
function l  { Get-ChildItem $args }
function grep { Select-String $args }
function touch {
    param($file)
    if (Test-Path $file) { (Get-Item $file).LastWriteTime = Get-Date }
    else { New-Item -ItemType File -Path $file | Out-Null }
}
Set-Alias -Name clear -Value Clear-Host
```


### 自動実行(タスク スケジューラー)

#### タスク一覧

```powershell:タスク一覧
schtasks /query | Select-String "Schtask_"
```

#### タスク削除

```powershell:タスク削除
$task_name = 'WSL'
schtasks /delete /tn "Schtask_${task_name}" /f
```

#### ユーザーログオン時のタスク作成(ONLOGON)

```powershell:タスク作成
$task_name = 'WSL'
$action = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -Command "wsl \"~\""'
schtasks /Create /TN "Schtask_${task_name}" /SC ONLOGON /RL HIGHEST /TR $action /F
```
- ProcessWindowStyle
  - https://learn.microsoft.com/dotnet/api/system.diagnostics.processwindowstyle?view=net-10.0#-----
  - Normal, Hidden, Minimized, Maximized

### ディスプレイオフ

```powershell
(Add-Type '[DllImport("user32.dll")]public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)
```

### Windows Updtate

#### 更新プログラムのチェック

```powershell:更新プログラムのチェック
Install-Module -Name PSWindowsUpdate -Force -AllowClobber; Import-Module PSWindowsUpdate; Get-WindowsUpdate
```

メモ: Uninstall-Module PSWindowsUpdate -AllVersions -Force

#### 全て適用

```powershell:全て適用
Install-Module -Name PSWindowsUpdate -Force -AllowClobber; Import-Module PSWindowsUpdate; Install-WindowsUpdate -AcceptAll
```

### コンピューターの状態

https://learn.microsoft.com/powershell/scripting/samples/changing-computer-state?view=powershell-7.6#shutting-down-or-restarting-a-computer

### Windows PowerShell (Windows Hello) での SSH 鍵生成と接続設定

Windows Hello（顔認証、指紋認証、PIN）を利用して、パスワードレスで安全に SSH 接続を行うためのセットアップ手順です。

#### 0. パスキー認証問題

顔 -> PIN -> 顔で回避可能

- https://github.com/sirAndros/KeePassWinHello/issues/86
  - https://github.com/microsoft/terminal/issues/17373

「Terminal から SSH を実行し、それが Windows Hello を呼び出した時に、ポップアップが一瞬で消える・裏に回る・フォーカスを失ってエラー（タイムアウト）になる」という問題は、**Windows Terminal (OpenConsole) と セキュアデスクトップ (CredentialUIBroker) 間の仕様の衝突**として、KeePass、1Password、Win32-OpenSSH などのリポジトリで共通して「Terminal 側のバグ・仕様」として扱われています。
そのため、`conhost`（旧コマンドプロンプト）や `Git Bash` などの異なる描画コンソールを使うことが一番の回避策として定着しています。

#### 1. 既存の環境のクリーンアップと準備

SSH 接続時のタイミング問題（競合によるエラー）を防ぐため、`ssh-agent` は使用せずにクライアントが直接認証を行う構成にします。

管理者権限で PowerShell を開き、以下のコマンドを実行して `ssh-agent` を停止・無効化します。

```powershell
Stop-Service -Name ssh-agent -ErrorAction SilentlyContinue
Set-Service -Name ssh-agent -StartupType Manual -ErrorAction SilentlyContinue
```

#### 2. Windows Hello (パスキー) 用の SSH 鍵を生成する

Windows Hello の TPM で管理される ECDSA-SK 鍵を生成します。パスフレーズを空（`-N ""`）にすることで、SSH 鍵自体のパスワード入力を省略し、Windows Hello の生体認証/PIN に委譲します。

以下のスクリプトを PowerShell で実行してください。

```powershell
$sshDir = "$HOME\.ssh"
$keyPath = "$sshDir\id_ecdsa_sk"
$pubKeyPath = "$sshDir\id_ecdsa_sk.pub"

# .ssh フォルダが存在しない場合は作成する
if (-not (Test-Path $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    Write-Host ".ssh フォルダを作成しました。" -ForegroundColor Green
}

# 既存の鍵がある場合は削除（上書き）
if (Test-Path $keyPath) { Remove-Item $keyPath -Force }
if (Test-Path $pubKeyPath) { Remove-Item $pubKeyPath -Force }

Write-Host "`n>>> SSH鍵を生成します。Windows セキュリティの画面が出たら認証してください <<<" -ForegroundColor Cyan
ssh-keygen -t ecdsa-sk -C "win-hello-passkey" -f $keyPath -N ""

Write-Host "`n>>> 生成された公開鍵 <<<" -ForegroundColor Yellow
$pubKey = Get-Content $pubKeyPath
Write-Host $pubKey

$pubKey | Set-Clipboard
Write-Host "`n※ 公開鍵をクリップボードにコピーしました。" -ForegroundColor Green
```

生成された公開鍵を、接続先サーバーの `~/.ssh/authorized_keys` や GitHub の SSH Keys 設定に追加してください。

#### 3. SSH Config の設定

SSH クライアントが Windows Hello を確実かつ最速で呼び出せるよう、`~/.ssh/config` に設定を追加します。

以下のコマンドを実行して設定を書き込みます。

```powershell
$configPath = "$HOME\.ssh\config"

$configContent = @"
Host *
    IdentityFile ~/.ssh/id_ecdsa_sk
    IdentitiesOnly yes
    SecurityKeyProvider internal
"@

Add-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Host "SSH config を更新しました。" -ForegroundColor Green
```

##### 設定値の解説
- `IdentityFile ~/.ssh/id_ecdsa_sk`: 作成したパスキー鍵を明示的に指定します。
- `IdentitiesOnly yes`: ssh-agent 等への余計な問い合わせを省略し、指定した鍵のみを使用させることでタイミングエラーを防ぎます。
- `SecurityKeyProvider internal`: Windows Hello 用のネイティブプロバイダを明示指定します。

#### 4. 接続のテスト

あとは通常通り SSH コマンドを実行するだけです。

```powershell
ssh ユーザー名@ホスト名
```

実行すると、ターミナル上でのパスワード入力はスキップされ、Windows Hello のポップアップが表示されます。指紋・顔・PIN のいずれかで認証すれば即座にログインが完了します。

### パスワードなし起動

```pwsh
netplwiz
```

### python3 on windows/pwsh

#### uv をインストール

winget で uv をインストールする。

```powershell:uvインストール
winget install --id=astral-sh.uv -e
```

#### python3.12 インストール

まず Windows が勝手に用意しているダミースタブをオフにして、邪魔な `python.exe` を検索対象から外す。

GUI同期しなくてもいいからさっさと健康になりたい場合はコレ。

```powershell:GUI同期しなくてもいいからさっさと健康になりたい場合
Remove-Item "$env:LOCALAPPDATA\Microsoft\WindowsApps\python*.exe" -Force -ErrorAction SilentlyContinue
```

操作方法がコロコロ変わってしまうGUIでやりたいなら2026/8/23だとコレ。

1. Windows の「**設定**」を開く（`Win + I`）
2. 「**アプリ**」→「**アプリの詳細設定**」→「**アプリ実行エイリアス**」を開く
3. 一覧にある **「アプリ インストーラー (python.exe)」** と **「アプリ インストーラー (python3.exe)」** のスイッチを **オフ** にする

uv で python3.12 をインストール。

```powershell:python3.12インストール
uv python list --only-installed
uv python install 3.12
uv python update-shell
uv pip install --upgrade pip
```

#### python3.12 アンインストール

uv で python3.12 をアンインストール。

```powershell:python3.12セットアップ解除
uv python uninstall 3.12
uv cache prune
uv python update-shell
uv python list --only-installed
```

##
