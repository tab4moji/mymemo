## Powershell 7 (pwsh.exe) を便利にしたい

### CTRL+M で ENTER したい

```pwsh
Set-PSReadLineKeyHandler -Key "Ctrl+m" -Function AcceptLine
```

他も。

```pwsh
Set-PSReadLineKeyHandler -Key "Ctrl+m" -Function AcceptLine
Set-PSReadLineKeyHandler -Key "Ctrl+a" -Function BeginningOfLine
Set-PSReadLineKeyHandler -Key "Ctrl+k" -Function KillLine
Set-PSReadLineKeyHandler -Key "Ctrl+e" -Function EndOfLine
Set-PSReadLineKeyHandler -Key "Ctrl+u" -Function BackwardKillLine
```

### TAB補完したい

```pwsh
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

    # 2. 予測しない(または行末でない)場合は、「通常のTAB補完」を行う
    #    ※もし一覧表示がいいなら TabCompleteNext を MenuComplete に変えてくれ
    [Microsoft.PowerShell.PSConsoleReadLine]::TabCompleteNext()
}

Set-PSReadLineKeyHandler -Key "Tab"    -ScriptBlock $TabAction
Set-PSReadLineKeyHandler -Key "Ctrl+i" -ScriptBlock $TabAction
```

### Administratorなのかどうか

Admin権限なら True

```pwsh
[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

