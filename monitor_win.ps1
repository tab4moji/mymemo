# 目的: Windowsのリソース負荷情報を1秒毎に高速取得しJSONで標準出力する
# 機能: V2.20 GPUエンジンの動的生成・破棄に対応するため、Continuousを廃止し毎秒ワイルドカードを再評価する
# 更新履歴:
# - 027: 2026-07-20: Get-Counter の Continuous モードを廃止し、whileループでの都度取得へ変更

$ProgressPreference = 'SilentlyContinue'

# 英語・日本語OS両対応のカウンターパス
$candidates = @(
    "\Processor(*)\% Processor Time", "\プロセッサ(*)\% プロセッサ タイム",
    "\PhysicalDisk(*)\% Disk Time", "\物理ディスク(*)\% ディスク タイム",
    "\GPU Engine(*)\Utilization Percentage", "\GPU エンジン(*)\使用率",
    "\GPU Process Memory(*)\Local Usage", "\GPU プロセス メモリ(*)\ローカル使用量",
    "\*NPU*\Utilization Percentage", "\*NPU*\使用率"
)

while ($true) {
    # -MaxSamples 1 を指定して1秒間だけサンプリングし、完了後に次のループへ回す。
    # 毎回ワイルドカードが再展開されるため、新しく起動したプロセスのGPUエンジンを絶対に見失わない。
    $results = Get-Counter -Counter $candidates -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue

    $cpuDict = @{}; $gpuUsageDict = @{}; $vramDict = @{}
    $diskDict = @{}; $npuDict = @{}

    if ($null -ne $results) {
        # Get-Counter は配列を返す場合と単一オブジェクトを返す場合がある
        foreach ($result in $results) {
            foreach ($sample in $result.CounterSamples) {
                $path = $sample.Path.ToLower()
                $inst = $sample.InstanceName.ToLower()
                $val = $sample.CookedValue

                if ($path -match "processor" -or $path -match "プロセッサ") {
                    if ($inst -ne "_total") {
                        $cpuDict[$inst] = $val
                    }
                }
                elseif ($path -match "physicaldisk" -or $path -match "物理ディスク") {
                    if ($inst -ne "_total") {
                        $diskDict[$inst] = $val
                    }
                }
                elseif ($path -match "gpu engine" -or $path -match "gpu エンジン") {
                    if ($inst -match "luid_(0x[0-9a-f]+_0x[0-9a-f]+)") {
                        $l = $matches[1]
                        if (-not $gpuUsageDict.ContainsKey($l) -or $val -gt $gpuUsageDict[$l]) {
                            $gpuUsageDict[$l] = $val
                        }
                    }
                }
                elseif ($path -match "gpu process memory" -or $path -match "gpu プロセス メモリ") {
                    if ($inst -match "luid_(0x[0-9a-f]+_0x[0-9a-f]+)") {
                        $l = $matches[1]
                        if (-not $vramDict.ContainsKey($l)) { $vramDict[$l] = 0 }
                        $vramDict[$l] += $val
                    }
                }
                elseif ($path -match "npu") {
                    if ($inst -ne "_total") {
                        $npuDict[$inst] = $val
                    }
                }
            }
        }
    }

    # CPUs
    $cpuArr = @()
    $cpuKeys = $cpuDict.Keys | Sort-Object {
        $parts = $_ -split ","
        if ($parts.Length -eq 2) { [int]$parts[1] } else { 0 }
    }
    foreach ($k in $cpuKeys) { 
        $cpuArr += [math]::Round($cpuDict[$k])
    }

    # GPUs
    $gpuArr = @()
    $gpuKeys = ($gpuUsageDict.Keys + $vramDict.Keys) | Select-Object -Unique | Sort-Object
    foreach ($k in $gpuKeys) {
        $u = 0; if ($gpuUsageDict.ContainsKey($k)) { $u = [math]::Round($gpuUsageDict[$k]) }
        if ($u -gt 100) { $u = 100 }
        $vBytes = 0; if ($vramDict.ContainsKey($k)) { $vBytes = $vramDict[$k] }
        $gpuArr += @{
            Usage = $u
            VRAM_MB = [math]::Round($vBytes / 1MB, 1)
        }
    }

    # Disks
    $diskArr = @()
    $diskKeys = $diskDict.Keys | Sort-Object {
        if ($_ -match "^(\d+)") { [int]$matches[1] } else { 0 }
    }
    
    $diskCapDict = @{}
    try {
        $drives = [System.IO.DriveInfo]::GetDrives()
        foreach ($d in $drives) {
            if ($d.IsReady) {
                $name = $d.Name.Substring(0,2).ToUpper()
                $diskCapDict[$name] = @{
                    Size = $d.TotalSize
                    Free = $d.TotalFreeSpace
                }
            }
        }
    } catch {}

    foreach ($k in $diskKeys) {
        $d = [math]::Round($diskDict[$k])
        if ($d -gt 100) { $d = 100 }
        
        $capPct = 0
        if ($k -match "^(\d+)\s+(.+)$") {
            $driveLetters = $matches[2] -split "\s+"
            $totalSize = 0
            $totalFree = 0
            foreach ($drv in $driveLetters) {
                $drvUpper = $drv.ToUpper()
                if ($diskCapDict.ContainsKey($drvUpper)) {
                    $totalSize += $diskCapDict[$drvUpper].Size
                    $totalFree += $diskCapDict[$drvUpper].Free
                }
            }
            if ($totalSize -gt 0) {
                $used = $totalSize - $totalFree
                $capPct = [math]::Round(($used / $totalSize) * 100)
            }
        }

        $diskArr += @{
            Usage = $d
            CapPct = $capPct
        }
    }

    # NPUs
    $npuArr = @()
    $npuKeys = $npuDict.Keys | Sort-Object
    foreach ($k in $npuKeys) {
        $n = [math]::Round($npuDict[$k])
        if ($n -gt 100) { $n = 100 }
        $npuArr += $n
    }

    $totalCPU = 0
    if ($cpuArr.Count -gt 0) {
        $sum = 0
        foreach ($c in $cpuArr) { $sum += $c }
        $totalCPU = [math]::Round($sum / $cpuArr.Count)
    }

    $totalMEM = 0
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $totalMEM = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)
        }
    } catch {}

    $data = @{
        TotalCPU = $totalCPU
        TotalMEM = $totalMEM
        CPUs = $cpuArr
        GPUs = $gpuArr
        NPUs = $npuArr
        Disks = $diskArr
    }

    $json = $data | ConvertTo-Json -Compress
    [Console]::WriteLine($json)
}
