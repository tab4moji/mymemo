## Radeon ノウハウ

### AMD Adrenarin 終了

```powershell
# 説明(Description)またはプロセス名に "AMD" が含まれるプロセスをすべて取得
$amdProcs = Get-Process | Where-Object { $_.Description -match "AMD" -or $_.Name -match "AMD" }

if ($amdProcs) {
    foreach ($proc in $amdProcs) {
        Write-Host "終了しています: $($proc.Name).exe (PID: $($proc.Id)) - $($proc.Description)"
        # 取得したプロセスID(PID)を taskkill に渡してツリーごと強制終了
        taskkill /PID $($proc.Id) /F /T
    }
} else {
    Write-Host "AMDに関連するプロセスは見つかりませんでした。"
}
```

```powershell
start "C:\Program Files\AMD\CNext\CNext\RadeonSoftware.exe"
```
