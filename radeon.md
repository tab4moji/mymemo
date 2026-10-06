## Radeon ノウハウ

### AMD Adrenarin リセット

#### AMD Adrenarin 強制終了

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

#### AMD Adrenarin 再起動

```powershell
start "C:\Program Files\AMD\CNext\CNext\RadeonSoftware.exe"
```

### GPU チェック

```powershell:コマンド
$env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"; $env:HIP_VISIBLE_DEVICES = "0,1"; $env:ROCR_VISIBLE_DEVICES = "0,1"; uv run --index-url https://rocm.nightlies.amd.com/whl-multi-arch/ --with "torch[device-all]" --with numpy python -c "import torch; print('=== ROCm Multi-GPU Check ==='); print('Available :', torch.cuda.is_available()); [print(f'Device [{i}]: {torch.cuda.get_device_name(i)} | VRAM: {round(torch.cuda.get_device_properties(i).total_memory / 1e9, 2)} GB') for i in range(torch.cuda.device_count())]"
```

動作結果

```powershell:動作結果
PS C:\> $env:HSA_OVERRIDE_GFX_VERSION = "11.0.0"; $env:HIP_VISIBLE_DEVICES = "0,1"; $env:ROCR_VISIBLE_DEVICES = "0,1"; uv run --index-url https://rocm.nightlies.amd.com/whl-multi-arch/ --with "torch[device-all]" --with numpy python -c "import torch; print('=== ROCm Multi-GPU Check ==='); print('Available :', torch.cuda.is_available()); [print(f'Device [{i}]: {torch.cuda.get_device_name(i)} | VRAM: {round(torch.cuda.get_device_properties(i).total_memory / 1e9, 2)} GB') for i in range(torch.cuda.device_count())]"
=== ROCm Multi-GPU Check ===
Available : True
Device [0]: AMD Radeon(TM) Graphics | VRAM: 13.12 GB
Device [1]: AMD Radeon RX 9060 XT | VRAM: 17.1 GB
PS C:\>
```
