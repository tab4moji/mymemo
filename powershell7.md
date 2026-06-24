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

```powershell
# =============================================================================
# Linux/Emacs Style Keybindings for PowerShell
# Updated: 2026-01-19 (Fixed Ctrl+D)
# =============================================================================

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

### プロファイル作成 & 編集コマンド

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


### python3.14t on windows/pwsh

#### python3 インストール

```powershell
winget install --id Python.Python.3.14 --exact --override "/quiet InstallAllUsers=1 PrependPath=1 Include_doc=0 Include_tcltk=0 Include_test=0 Include_freethreaded=1"
```

#### python3 のPATHを通す

```powershell
# 1. 実行可能かチェック
$cmdName = "python3.14t"
if (Get-Command $cmdName -ErrorAction SilentlyContinue) {
    Write-Output "$cmdName は既にPATHが通っている。"
} else {
    Write-Output "$cmdName が認識されないため、自動修復を開始する..."

    # 2. 実体パスを検索
    $searchPaths = @("C:\Program Files\Python314", "$env:LOCALAPPDATA\Programs\Python\Python314")
    $found = Get-ChildItem -Path $searchPaths -Filter "$cmdName.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $found) {
        Write-Output "エラー: $cmdName.exe がシステム上に見つからない。インストールをやり直せ。"
    } else {
        $targetPath = $found.Directory.FullName
        Write-Output "実体パスを発見: $targetPath"

        # 3. ユーザーの環境変数(永続PATH)に追加
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notmatch [regex]::Escape($targetPath)) {
            $newUserPath = $userPath.TrimEnd(';') + ";" + $targetPath
            [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
            Write-Output "永続的なユーザー環境変数(PATH)に登録した。"
        }

        # 4. 現在のセッションのPATHに追加 (再起動なしで即使うため)
        if ($env:PATH -notmatch [regex]::Escape($targetPath)) {
            $env:PATH = $env:PATH.TrimEnd(';') + ";" + $targetPath
            Write-Output "現在のセッションのPATHに反映した。"
        }

        Write-Output "自動修復完了。$cmdName が使用可能になった。"
    }
}
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
  - https://learn.microsoft.com/ja-jp/dotnet/api/system.diagnostics.processwindowstyle?view=net-10.0#-----
  - Normal, Hidden, Minimized, Maximized

### Windows Updtate

#### 更新プログラムのチェック

```powershell:準備
Install-Module -Name PSWindowsUpdate -Force -AllowClobber; Import-Module PSWindowsUpdate
```

```powershell:更新プログラムのチェック
Get-WindowsUpdate
```

#### 全て適用

```powershell:全て適用
Install-WindowsUpdate -AcceptAll -AutoReboot
```

##
