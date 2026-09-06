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
# 1. プロファイル用のフォルダが無ければ作る
if (!(Test-Path (Split-Path $PROFILE))) { New-Item -ItemType Directory -Force -Path (Split-Path $PROFILE) }

# 2. ファイルが無ければ空っぽのものを作る
if (!(Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force }

# 3.『メモ帳』で開く
notepad $PROFILE
```

```powershell
PowerShell 7.5.4
PS C:\> edit $PROFILE
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

Windows Hello（顔認証、指紋認証、PIN）を利用して、パスワードレスで安全に SSH 接続を行うためのセットアップ手順。

#### 0. パスキー認証問題

顔 -> PIN -> 顔で回避可能

- https://github.com/sirAndros/KeePassWinHello/issues/86
  - https://github.com/microsoft/terminal/issues/17373

「Terminal から SSH を実行し、それが Windows Hello を呼び出した時に、ポップアップが一瞬で消える・裏に回る・フォーカスを失ってエラー（タイムアウト）になる」という問題は、**Windows Terminal (OpenConsole) と セキュアデスクトップ (CredentialUIBroker) 間の仕様の衝突**として、KeePass、1Password、Win32-OpenSSH などのリポジトリで共通して「Terminal 側のバグ・仕様」として扱われている。
そのため、`conhost`（旧コマンドプロンプト）や `Git Bash` などの異なる描画コンソールを使うことが一番の回避策として定着しているらしい。

#### 1. SSH 鍵を生成して Windows Hello (パスキー) 管理する

Windows Hello の TPM で管理される ECDSA-SK 鍵を生成します。パスフレーズを空（`-N ""`）にすることで、SSH 鍵自体のパスワード入力を省略し、Windows Hello の生体認証/PIN に委譲。

以下のスクリプトを PowerShell で実行。

```powershell
<#
.SYNOPSIS
    FIDO2/パスキー対応SSH公開鍵の自動探索と認証コピー

.DESCRIPTION
    ~/.ssh 配下のパスキー秘密鍵(*_sk)を自動検出し、
    パスキー認証を経て公開鍵をクリップボードにコピーする。
    見つからない場合は探索結果を表示して中断する。

.REVISION HISTORY
    1.1.0 (2026-09-06): パスキー鍵の動的検出機能の追加
    1.0.0 (2026-09-06): 初版作成
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Export-PasskeyPublicKey {
    param(
        [Parameter(Mandatory = $false)]
        [string]$SshDir = "$HOME\.ssh"
    )

    $result = $null

    try {
        if (-not (Test-Path -Path $SshDir)) {
            throw "SSHディレクトリが存在しない: $SshDir"
        }

        # *_sk のうち、公開鍵(.pub)ではない秘密鍵ファイルを列挙
        $skKeys = Get-ChildItem -Path $SshDir -File | Where-Object {
            $_.Name -like "*_sk" -and $_.Extension -ne ".pub"
        }

        if (@($skKeys).Count -eq 0) {
            # 秘密鍵が見つからない場合、念のため .pub のみがあるか確認
            $pubOnly = Get-ChildItem -Path $SshDir -File -Filter "*_sk.pub"
            if (@($pubOnly).Count -gt 0) {
                [Console]::Error.WriteLine("公開鍵は見つかったが、対応する秘密鍵(*_sk)が存在しない:")
                $pubOnly | ForEach-Object { [Console]::Error.WriteLine(" - $($_.Name)") }
                throw "秘密鍵が存在しないため、パスキー認証を実行できない。"
            }

            # 存在する全ファイルを一覧表示して終了
            [Console]::Error.WriteLine("~/.ssh 配下にパスキー鍵(*_sk)が見つからなかった。現在のファイル一覧:")
            Get-ChildItem -Path $SshDir -File | ForEach-Object { [Console]::Error.WriteLine(" - $($_.Name)") }
            throw "パスキー対応の秘密鍵ファイルが見つからない。"
        }

        # 最初に見つかったパスキー鍵（または特定のもの）を使用
        $targetKey = $skKeys[0].FullName
        [Console]::Error.WriteLine("検出した秘密鍵: $($skKeys[0].Name)")
        [Console]::Error.WriteLine("パスキー認証（タッチ/PIN）を行ってほしい。")

        # 秘密鍵からパスキー認証を伴って公開鍵を導出
        $pubKey = & ssh-keygen -y -f $targetKey 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "認証または公開鍵の導出に失敗した: $pubKey"
        }

        $cleanKey = ($pubKey -join "`n").Trim()
        Set-Clipboard -Value $cleanKey
        [Console]::Error.WriteLine("公開鍵をクリップボードにコピーした。")

        $result = $cleanKey
    }
    catch {
        [Console]::Error.WriteLine("[ERROR] $($_.Exception.Message)")
        throw $_
    }

    return $result
}

# 実行
Export-PasskeyPublicKey
```

*生成された公開鍵を、接続先サーバーの `~/.ssh/authorized_keys` や GitHub の SSH Keys 設定に追加すること。*

#### 2. pwsh 用 ssh の設定

```powershell
# ----------------------------------------------------------------------
# Windows Terminal 用 Windows Hello (FIDO2 / ecdsa-sk) フォーカス修正
# ----------------------------------------------------------------------
if (-not ([System.Management.Automation.PSTypeName]'Win32Focus').Type) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class Win32Focus {
    [DllImport("user32.dll")]
    public static extern bool AllowSetForegroundWindow(int dwProcessId);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    public static void Grant() {
        // すべてのプロセス (-1) にフォアグラウンド権限を委譲
        AllowSetForegroundWindow(-1);
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd != IntPtr.Zero) {
            SetForegroundWindow(hwnd);
        }
    }
}
"@
}

# ssh コマンドのラッパー
function ssh {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList
    )
    [Win32Focus]::Grant()
    $sshExe = @(Get-Command -CommandType Application ssh)[0].Source
    & $sshExe @ArgumentList
}

# 必要に応じて ssh-keygen や ssh-add も同様にラップ可能
function ssh-keygen {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList
    )
    [Win32Focus]::Grant()
    $bin = @(Get-Command -CommandType Application ssh-keygen)[0].Source
    & $bin @ArgumentList
}

function ssh-add {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList
    )
    [Win32Focus]::Grant()
    $bin = @(Get-Command -CommandType Application ssh-add)[0].Source
    & $bin @ArgumentList
}
```

#### 4. 接続のテスト

あとは通常通り SSH コマンドを実行するだけ。

```powershell
ssh ユーザー名@ホスト名
```

実行すると、ターミナル上でのパスワード入力はスキップされ、Windows Hello のポップアップが表示されるから認証する。指紋・顔・PIN のいずれかで認証すれば即座にログインが完了。

### Windows をパスワードなし起動したい

```pwsh
netplwiz
```

### Windows Update 直行ショートカットが欲しい

Windows Updateショートカット作成

```powershell:Windows Updateショートカット作成
$Shortcut = $WshShell.CreateShortcut("$env:AppData\Microsoft\Windows\Start Menu\Programs\Windows Update.lnk")
$Shortcut.TargetPath = "ms-settings:windowsupdate"
$Shortcut.IconLocation = "shell32.dll,46"
$Shortcut.Save()
```

Windows Updateショートカット削除

```powershll:Windows Updateショートカット削除
Remove-Item "$env:AppData\Microsoft\Windows\Start Menu\Programs\Windows Update.lnk" -Force
```

### python3 on windows/pwsh

- [uv の導入](./?content=uv#OyqTjGcF)

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
