## Powershell 7 (pwsh.exe) を便利にしたい

### Administratorなのかどうか

Admin権限なら True

```powershell
[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

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
