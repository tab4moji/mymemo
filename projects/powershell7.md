## Powershell 7 (pwsh.exe) を便利にしたい

### Administratorなのかどうか

Admin権限なら True

```powershell
[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

### CTRL+M で ENTER したい

```powershell
Set-PSReadLineOption -EditMode Emacs
```

### TAB補完したい

```powershell
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle Inline

$TabAction = {
    param($key, $arg)

    $line = $null
    $cursor = $null
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

    if ($cursor -eq $line.Length) {
        $before = $line
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptSuggestion()

        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

        if ($before -ne $line) { return }
    }

    # 予測しない(または行末でない)場合は、「通常のTAB補完」を行う
    # もし一覧表示がいいなら TabCompleteNext を MenuComplete に変える
    [Microsoft.PowerShell.PSConsoleReadLine]::TabCompleteNext()
}

Set-PSReadLineKeyHandler -Key "Tab"    -ScriptBlock $TabAction
Set-PSReadLineKeyHandler -Key "Ctrl+i" -ScriptBlock $TabAction
```
