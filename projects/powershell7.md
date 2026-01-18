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

### CTRL-D でさよなら

Ctrl+D に「行が空なら exit、文字があれば Delete（右側の文字削除）」という条件分岐の機能を割り当てれば、LinuxのBashと全く同じ挙動になる。

#### 設定コード ($PROFILE)

これをプロファイルに追記してくれ。

```powershell
Set-PSReadLineKeyHandler -Key "Ctrl+d" -ScriptBlock {
    $line = $null
    $cursor = $null
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

    # 行が空っぽなら終了 (exit)
    if ([String]::IsNullOrEmpty($line)) {
        exit
    }
    # 文字があるなら通常の Delete キーとして振る舞う
    else {
        [Microsoft.PowerShell.PSConsoleReadLine]::DeleteChar()
    }
}

```

#### 挙動の確認

1. 文字を入力中：`Ctrl+D` を押すと、カーソル位置の文字を削除する。
2. 何も入力していない時：`Ctrl+D` を押すと、PowerShell が終了する。
