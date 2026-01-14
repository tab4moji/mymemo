## Powershell 7 (pwsh.exe) を便利にしたい

### CTRL+M で ENTER したい

```pwsh
Set-PSReadLineKeyHandler -Key "Ctrl+m" -Function AcceptLine
```

### TAB補完

コマンドライン補完はタブキーじゃなくて右矢印キー。
でも無理やりTAB補完したい。

```pwsh
Set-PSReadLineKeyHandler -Key Tab -ScriptBlock {
    param($key, $arg)

    # 現在の入力状況を取得
    $line = $null
    $cursor = $null
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

    # カーソルが行末にある場合、まず予測の受け入れ(右矢印の動作)を試みる
    if ($cursor -eq $line.Length) {
        $prevLine = $line
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptSuggestion()
        
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
        
        # 予測を受け入れて行が変化したなら終了、変化してなければ通常の補完へ
        if ($prevLine -ne $line) {
            return
        }
    }

    # 予測がない、または行末でない場合は通常のTab補完を実行
    [Microsoft.PowerShell.PSConsoleReadLine]::TabCompleteNext()
}
```

### Administratorなのかどうか

Admin権限なら True

```pwsh
[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

