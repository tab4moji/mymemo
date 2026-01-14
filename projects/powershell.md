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

### TAB補完

コマンドライン補完はタブキーじゃなくて右矢印キー。
でも無理やりTAB補完したい。

```pwsh
$TabFunc = {
    param($key, $arg)

    $line = $null
    $cursor = $null
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

    if ($cursor -eq $line.Length) {
        $prevLine = $line
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptSuggestion()
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

        if ($prevLine -ne $line) { return }
    }

    [Microsoft.PowerShell.PSConsoleReadLine]::MenuComplete()
}

Set-PSReadLineKeyHandler -Key Tab -ScriptBlock $TabFunc
Set-PSReadLineKeyHandler -Key "Ctrl+i" -ScriptBlock $TabFunc
```

### Administratorなのかどうか

Admin権限なら True

```pwsh
[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

