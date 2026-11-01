#Requires -Version 7.0
# 目的: Windowsホストのリソース負荷(CPU/MEM/GPU/VRAM/GPU温度/NPU/Disk)をターミナル内にインライン表示する。
# 機能: 旧 monitor.py(描画/キー入力) と monitor_win.ps1(収集) を1つのpwshに統合。
#       収集は別Runspaceで毎秒実行し、メインループは描画とqキー監視のみ行う。(WSL不要・Windows上で直接実行)
# 更新履歴:
# - 029: 2026-10-31: monitor.py と monitor_win.ps1(028) を単一のpwshスクリプトへ統合。
#                    JSON経由とサブプロセスを廃止し、ConcurrentQueueでデータを受け渡す。
#                    CPUコアの並び順を末尾の数値基準に修正。
# - 030: 2026-11-02: チラつき対策。毎回の全消去(ESC[J先行)を廃止し、行末消去(ESC[K)付きの上書き描画へ変更。
#                    内容が前回と同一なら再描画しない。描画中はカーソル非表示。
# - 031: 2026-11-02: 「Press 'q' to quit.」行と末尾の空行を削除。終了時のみ改行を出力する。
# 注意: 日本語カウンター名を含むため、UTF-8(BOM付き推奨)で保存すること。

$script:Esc = [char]27

# ---------------------------------------------------------------
# GPU温度取得用 C# (D3DKMT API)
# ---------------------------------------------------------------
$script:GpuSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class D3dGpuMonitor {
    [StructLayout(LayoutKind.Sequential)]
    public struct LUID { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    public struct D3DKMT_ADAPTERINFO {
        public uint hAdapter;
        public LUID AdapterLuid;
        public uint NumSources;
        public uint PresentMoveRegionsIndexedSupported;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct D3DKMT_ENUMADAPTERS2 {
        public uint NumAdapters;
        public IntPtr pAdapters;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct D3DKMT_CLOSEADAPTER { public uint hAdapter; }

    public enum KMTQUERYADAPTERINFOTYPE : uint { KMTQAITYPE_ADAPTERPERFDATA = 62 }

    [StructLayout(LayoutKind.Sequential)]
    public struct D3DKMT_QUERYADAPTERINFO {
        public uint hAdapter;
        public KMTQUERYADAPTERINFOTYPE Type;
        public IntPtr pPrivateDriverData;
        public uint PrivateDriverDataSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct D3DKMT_ADAPTER_PERFDATA {
        public uint PhysicalAdapterIndex;
        public ulong MemoryFrequency;
        public ulong MaxMemoryFrequency;
        public ulong MaxMemoryFrequencyOC;
        public ulong MemoryBandwidth;
        public ulong PCIEBandwidth;
        public uint FanRPM;
        public uint Power;
        public uint Temperature;        // 1 = 0.1 deg C
        public byte PowerStateOverride;
    }

    [DllImport("gdi32.dll")]
    public static extern int D3DKMTEnumAdapters2(ref D3DKMT_ENUMADAPTERS2 pData);
    [DllImport("gdi32.dll")]
    public static extern int D3DKMTQueryAdapterInfo(ref D3DKMT_QUERYADAPTERINFO pData);
    [DllImport("gdi32.dll")]
    public static extern int D3DKMTCloseAdapter(ref D3DKMT_CLOSEADAPTER pData);

    public class GpuMetric {
        public string Luid { get; set; }
        public double Temperature { get; set; }
        public uint FanRPM { get; set; }
    }

    public static List<GpuMetric> GetGpuMetrics() {
        var results = new List<GpuMetric>();
        var enumData = new D3DKMT_ENUMADAPTERS2();
        if (D3DKMTEnumAdapters2(ref enumData) != 0 || enumData.NumAdapters == 0) {
            return results;
        }

        int adapterInfoSize = Marshal.SizeOf(typeof(D3DKMT_ADAPTERINFO));
        IntPtr pAdapters = Marshal.AllocHGlobal(adapterInfoSize * (int)enumData.NumAdapters);
        try {
            enumData.pAdapters = pAdapters;
            if (D3DKMTEnumAdapters2(ref enumData) != 0) {
                return results;
            }

            int perfSize = Marshal.SizeOf(typeof(D3DKMT_ADAPTER_PERFDATA));
            IntPtr pPerf = Marshal.AllocHGlobal(perfSize);
            try {
                for (int i = 0; i < enumData.NumAdapters; i++) {
                    IntPtr currentPtr = new IntPtr(pAdapters.ToInt64() + (i * adapterInfoSize));
                    var info = Marshal.PtrToStructure<D3DKMT_ADAPTERINFO>(currentPtr);

                    var perf = new D3DKMT_ADAPTER_PERFDATA();
                    Marshal.StructureToPtr(perf, pPerf, false);

                    var query = new D3DKMT_QUERYADAPTERINFO {
                        hAdapter = info.hAdapter,
                        Type = KMTQUERYADAPTERINFOTYPE.KMTQAITYPE_ADAPTERPERFDATA,
                        pPrivateDriverData = pPerf,
                        PrivateDriverDataSize = (uint)perfSize
                    };

                    double tempC = 0.0;
                    uint fan = 0;
                    if (D3DKMTQueryAdapterInfo(ref query) == 0) {
                        var resPerf = Marshal.PtrToStructure<D3DKMT_ADAPTER_PERFDATA>(pPerf);
                        tempC = resPerf.Temperature / 10.0;
                        fan = resPerf.FanRPM;
                    }

                    results.Add(new GpuMetric {
                        Luid = string.Format("0x{0:x8}_0x{1:x8}", (uint)info.AdapterLuid.HighPart, info.AdapterLuid.LowPart),
                        Temperature = tempC,
                        FanRPM = fan
                    });

                    var closeData = new D3DKMT_CLOSEADAPTER { hAdapter = info.hAdapter };
                    D3DKMTCloseAdapter(ref closeData);
                }
            } finally {
                Marshal.FreeHGlobal(pPerf);
            }
        } finally {
            Marshal.FreeHGlobal(pAdapters);
        }
        return results;
    }
}
'@

# ---------------------------------------------------------------
# 収集側スクリプト (別Runspaceで実行される)
# ---------------------------------------------------------------
$script:CollectorScript = @'
param($Queue, $Ctl)
$ProgressPreference = 'SilentlyContinue'

$candidates = @(
    "\Processor(*)\% Processor Time", "\プロセッサ(*)\% プロセッサ タイム",
    "\PhysicalDisk(*)\% Disk Time", "\物理ディスク(*)\% ディスク タイム",
    "\GPU Engine(*)\Utilization Percentage", "\GPU エンジン(*)\使用率",
    "\GPU Process Memory(*)\Local Usage", "\GPU プロセス メモリ(*)\ローカル使用量",
    "\*NPU*\Utilization Percentage", "\*NPU*\使用率"
)

function Get-AlivePids {
    $set = [System.Collections.Generic.HashSet[int]]::new()
    try {
        foreach ($p in [System.Diagnostics.Process]::GetProcesses()) { [void]$set.Add($p.Id) }
    } catch {}
    return ,$set
}

function Read-Counters {
    param($AlivePids)
    $b = @{ Cpu = @{}; Gpu = @{}; Vram = @{}; Disk = @{}; Npu = @{} }
    $results = Get-Counter -Counter $candidates -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue
    foreach ($result in @($results)) {
        if ($null -eq $result) { continue }
        foreach ($s in $result.CounterSamples) {
            $path = $s.Path.ToLower(); $inst = $s.InstanceName.ToLower(); $val = $s.CookedValue
            if ($path -match "processor" -or $path -match "プロセッサ") {
                if ($inst -ne "_total") { $b.Cpu[$inst] = $val }
            }
            elseif ($path -match "physicaldisk" -or $path -match "物理ディスク") {
                if ($inst -ne "_total") { $b.Disk[$inst] = $val }
            }
            elseif ($path -match "gpu engine" -or $path -match "gpu エンジン") {
                # 3D/Compute/Videoのみ対象。Copy等の100%固定化を除外
                if ($inst -match "engtype_(3d|compute|video)" -and $inst -match "luid_(0x[0-9a-f]+_0x[0-9a-f]+)") {
                    $l = $matches[1]
                    $alive = $true
                    if ($inst -match "pid_(\d+)") {
                        $pidNum = [int]$matches[1]
                        if ($pidNum -ne 4 -and -not $AlivePids.Contains($pidNum)) { $alive = $false }
                    }
                    if ($alive -and (-not $b.Gpu.ContainsKey($l) -or $val -gt $b.Gpu[$l])) { $b.Gpu[$l] = $val }
                }
            }
            elseif ($path -match "gpu process memory" -or $path -match "gpu プロセス メモリ") {
                if ($inst -match "luid_(0x[0-9a-f]+_0x[0-9a-f]+)") {
                    $l = $matches[1]
                    if (-not $b.Vram.ContainsKey($l)) { $b.Vram[$l] = 0 }
                    $b.Vram[$l] += $val
                }
            }
            elseif ($path -match "npu") {
                if ($inst -ne "_total") { $b.Npu[$inst] = $val }
            }
        }
    }
    return $b
}

function Get-CpuArray {
    param($Dict)
    $arr = @()
    $keys = $Dict.Keys | Sort-Object { [int](($_ -split ",")[-1]) }
    foreach ($k in $keys) { $arr += [math]::Round($Dict[$k]) }
    return $arr
}

function Get-GpuArray {
    param($Usage, $Vram)
    $temps = @{}
    try {
        foreach ($m in [D3dGpuMonitor]::GetGpuMetrics()) { $temps[$m.Luid.ToLower()] = $m.Temperature }
    } catch {}
    $arr = @()
    $keys = ($Usage.Keys + $Vram.Keys) | Select-Object -Unique | Sort-Object
    foreach ($k in $keys) {
        $u = 0; if ($Usage.ContainsKey($k)) { $u = [math]::Min(100, [math]::Round($Usage[$k])) }
        $v = 0; if ($Vram.ContainsKey($k)) { $v = $Vram[$k] }
        $t = 0.0; if ($temps.ContainsKey($k.ToLower())) { $t = $temps[$k.ToLower()] }
        $arr += @{ Usage = $u; VRAM_MB = [math]::Round($v / 1MB, 1); Temp = $t }
    }
    return $arr
}

function Get-DriveCapacity {
    $dict = @{}
    try {
        foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
            if ($d.IsReady) {
                $dict[$d.Name.Substring(0, 2).ToUpper()] = @{ Size = $d.TotalSize; Free = $d.TotalFreeSpace }
            }
        }
    } catch {}
    return $dict
}

function Get-DiskArray {
    param($Dict)
    $caps = Get-DriveCapacity
    $arr = @()
    $keys = $Dict.Keys | Sort-Object { if ($_ -match "^(\d+)") { [int]$matches[1] } else { 0 } }
    foreach ($k in $keys) {
        $usage = [math]::Min(100, [math]::Round($Dict[$k]))
        $capPct = 0
        if ($k -match "^(\d+)\s+(.+)$") {
            $size = 0; $free = 0
            foreach ($drv in ($matches[2] -split "\s+")) {
                $u = $drv.ToUpper()
                if ($caps.ContainsKey($u)) { $size += $caps[$u].Size; $free += $caps[$u].Free }
            }
            if ($size -gt 0) { $capPct = [math]::Round((($size - $free) / $size) * 100) }
        }
        $arr += @{ Usage = $usage; CapPct = $capPct }
    }
    return $arr
}

function Get-NpuArray {
    param($Dict)
    $arr = @()
    foreach ($k in ($Dict.Keys | Sort-Object)) { $arr += [math]::Min(100, [math]::Round($Dict[$k])) }
    return $arr
}

function Get-MemPercent {
    $pct = 0
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $pct = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)
        }
    } catch {}
    return $pct
}

function Get-Snapshot {
    $b = Read-Counters -AlivePids (Get-AlivePids)
    $cpus = @(Get-CpuArray $b.Cpu)
    $total = 0
    if ($cpus.Count -gt 0) { $total = [math]::Round(($cpus | Measure-Object -Sum).Sum / $cpus.Count) }
    $snap = @{
        TotalCPU = $total
        TotalMEM = (Get-MemPercent)
        CPUs     = $cpus
        GPUs     = @(Get-GpuArray $b.Gpu $b.Vram)
        NPUs     = @(Get-NpuArray $b.Npu)
        Disks    = @(Get-DiskArray $b.Disk)
    }
    return $snap
}

while (-not $Ctl.Stop) {
    try {
        $Queue.Enqueue((Get-Snapshot))
    } catch {
        $Ctl.LastError = $_.Exception.Message
        Start-Sleep -Seconds 1
    }
}
'@

# ---------------------------------------------------------------
# 描画側
# ---------------------------------------------------------------
function Write-ErrorLine {
    param([string]$Message)
    [Console]::Error.WriteLine($Message)
}

function Get-ItemList {
    param($Value)
    if ($null -eq $Value) { $items = @() } else { $items = @($Value) }
    return $items
}

function New-Bar {
    param($Value, [int]$Width = 40)
    $w = [math]::Max(4, $Width)
    try {
        $v = [math]::Min(100.0, [math]::Max(0.0, [double]$Value))
        $filled = [int][math]::Ceiling(($v / 100.0) * $w)
        $filled = [math]::Min($w, [math]::Max(0, $filled))
        $text = ('█' * $filled) + ('░' * ($w - $filled))
        $bar = '[{0}] {1,3}%' -f $text, [int][math]::Ceiling($v)
    } catch {
        $bar = '[{0}]   0%' -f ('░' * $w)
    }
    return $bar
}

function New-EmptyBar {
    param([int]$Width = 40)
    $w = [math]::Max(4, $Width)
    return ('[{0}]   -%' -f ('-' * $w))
}

function Get-Layout {
    param([int]$Cols)
    if ($Cols -lt 1) { throw "ターミナル幅が不正: $Cols" }
    $lo = @{}
    if ($Cols -ge 68) {
        $lo.CpuChunk = 4; $lo.CpuBw = [math]::Min(8, [int][math]::Floor(($Cols - 52) / 4))
    } elseif ($Cols -ge 34) {
        $lo.CpuChunk = 2; $lo.CpuBw = [math]::Min(15, [int][math]::Floor(($Cols - 26) / 2))
    } else {
        $lo.CpuChunk = 1; $lo.CpuBw = [math]::Min(40, [math]::Max(4, $Cols - 13))
    }
    if ($Cols -ge 52) {
        $lo.Combined = $true; $lo.Bw = [math]::Min(15, [int][math]::Floor(($Cols - 39) / 2))
    } else {
        $lo.Combined = $false; $lo.Bw = [math]::Min(40, [math]::Max(4, $Cols - 17))
    }
    return $lo
}

function Add-PairLines {
    # 1行結合モード(Combined)なら1行、そうでなければ縦に分割して行を追加する
    param($Lines, $Lo, [string]$Label, $Bar1, [string]$Label2, $Bar2, [string]$Suffix = '')
    if ($Lo.Combined) {
        $Lines.Add(('{0,-10} {1}  {2} {3}{4}' -f $Label, $Bar1, $Label2, $Bar2, $Suffix))
    } else {
        $Lines.Add(('{0,-10} {1}' -f $Label, $Bar1))
        $Lines.Add(('{0,-10} {1}' -f $Label2, $Bar2))
    }
}

function Add-CpuLines {
    param($Lines, $Data, $Lo)
    $cpus = @(Get-ItemList $Data.CPUs)
    for ($i = 0; $i -lt $cpus.Count; $i += $Lo.CpuChunk) {
        $end = [math]::Min($i + $Lo.CpuChunk, $cpus.Count) - 1
        $row = ''
        for ($n = $i; $n -le $end; $n++) {
            $row += 'C{0:00} {1}  ' -f $n, (New-Bar $cpus[$n] $Lo.CpuBw)
        }
        $Lines.Add('  ' + $row.TrimEnd())
    }
}

function Add-GpuLines {
    param($Lines, $Data, $Lo, $VramCaps)
    $gpus = @(Get-ItemList $Data.GPUs)
    if ($gpus.Count -eq 0) {
        $e = New-EmptyBar $Lo.Bw
        if ($Lo.Combined) {
            $Lines.Add(('{0,-10} {1}  VRAM {1}   -°C' -f 'GPU0', $e))
        } else {
            $Lines.Add(('{0,-10} {1}' -f 'GPU0', $e))
            $Lines.Add(('{0,-10} {1}' -f 'VRAM0', $e))
            $Lines.Add(('{0,-10}   -°C' -f 'TEMP0'))
        }
    }
    for ($i = 0; $i -lt $gpus.Count; $i++) {
        $g = $gpus[$i]
        $temp = [double]$g.Temp
        if ($temp -gt 0) { $tStr = '{0,3}°C' -f [int][math]::Round($temp) } else { $tStr = '  -°C' }
        if (-not $VramCaps.ContainsKey($i)) { $VramCaps[$i] = 16384.0 }
        if ($g.VRAM_MB -gt $VramCaps[$i]) { $VramCaps[$i] = [double]$g.VRAM_MB }
        $pct = [math]::Min(100.0, ($g.VRAM_MB / $VramCaps[$i]) * 100.0)
        $uBar = New-Bar $g.Usage $Lo.Bw
        $vBar = New-Bar $pct $Lo.Bw
        if ($Lo.Combined) {
            $Lines.Add(('{0,-10} {1}  VRAM {2}  {3}' -f "GPU$i", $uBar, $vBar, $tStr))
        } else {
            $Lines.Add(('{0,-10} {1}' -f "GPU$i", $uBar))
            $Lines.Add(('{0,-10} {1}' -f "VRAM$i", $vBar))
            $Lines.Add(('{0,-10} {1}' -f "TEMP$i", $tStr))
        }
    }
}

function Add-NpuLines {
    param($Lines, $Data, $Lo)
    $npus = @(Get-ItemList $Data.NPUs)
    if ($npus.Count -eq 0) {
        $Lines.Add(('{0,-10} {1}' -f 'NPU0', (New-EmptyBar $Lo.Bw)))
    }
    for ($i = 0; $i -lt $npus.Count; $i++) {
        $Lines.Add(('{0,-10} {1}' -f "NPU$i", (New-Bar $npus[$i] $Lo.Bw)))
    }
}

function Add-DiskLines {
    param($Lines, $Data, $Lo)
    $disks = @(Get-ItemList $Data.Disks)
    if ($disks.Count -eq 0) {
        $e = New-EmptyBar $Lo.Bw
        Add-PairLines $Lines $Lo 'Disk0' $e 'CAP.' $e
    }
    for ($i = 0; $i -lt $disks.Count; $i++) {
        $d = $disks[$i]
        Add-PairLines $Lines $Lo "Disk$i" (New-Bar $d.Usage $Lo.Bw) $(if ($Lo.Combined) { 'CAP.' } else { "CAP.$i" }) (New-Bar $d.CapPct $Lo.Bw)
    }
}

function Build-Frame {
    param($Data, [int]$Cols, $VramCaps)
    $lo = Get-Layout $Cols
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('=== Windows Host Resource Monitor ===')
    $cpuBar = New-Bar $Data.TotalCPU $lo.Bw
    $memBar = New-Bar $Data.TotalMEM $lo.Bw
    if ($lo.Combined) {
        $lines.Add(('{0,-10} {1}  MEM. {2}' -f 'CPU', $cpuBar, $memBar))
    } else {
        $lines.Add(('{0,-10} {1}' -f 'CPU', $cpuBar))
        $lines.Add(('{0,-10} {1}' -f 'MEM.', $memBar))
    }
    Add-CpuLines $lines $Data $lo
    Add-GpuLines $lines $Data $lo $VramCaps
    Add-NpuLines $lines $Data $lo
    Add-DiskLines $lines $Data $lo

    $safe = [math]::Max(1, $Cols - 1)
    $cut = foreach ($l in $lines) { if ($l.Length -gt $safe) { $l.Substring(0, $safe) } else { $l } }
    return ($cut -join "`r`n")   # 末尾の改行は付けない(空行を出さない)
}

function Write-Screen {
    # 画面消去せず上書き: 起点へ復帰(ESC[u) -> 各行を描画し行末だけ消去(ESC[K)
    # -> 最後に残骸だけ下方クリア(ESC[J)。先に消さないのでチラつかない。
    param([string]$Text)
    $e = $script:Esc
    $body = $Text.Replace("`r`n", "$e[K`r`n")
    [Console]::Out.Write("$e[u$body$e[J")
    [Console]::Out.Flush()
}

function Test-QuitKey {
    $quit = $false
    try {
        while ([Console]::KeyAvailable) {
            $k = [Console]::ReadKey($true)
            $isCtrlC = ($k.Key -eq [ConsoleKey]::C) -and (($k.Modifiers -band [ConsoleModifiers]::Control) -ne 0)
            if ($k.KeyChar -eq 'q' -or $k.KeyChar -eq 'Q' -or $isCtrlC) { $quit = $true }
        }
    } catch {
        $quit = $false
    }
    return $quit
}

function Get-TermSize {
    try {
        $size = @{ Cols = [Console]::WindowWidth; Rows = [Console]::WindowHeight }
    } catch {
        $size = @{ Cols = 80; Rows = 24 }
    }
    return $size
}

function Start-Collector {
    param($Queue, $Ctl)
    $rs = [runspacefactory]::CreateRunspace()
    $rs.Open()
    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    [void]$ps.AddScript($script:CollectorScript).AddArgument($Queue).AddArgument($Ctl)
    [void]$ps.BeginInvoke()
    return @{ Ps = $ps; Rs = $rs }
}

function Stop-Collector {
    param($Ctl, $Collector)
    if ($null -eq $Collector) { return }
    $Ctl.Stop = $true
    try { $Collector.Ps.Stop() } catch {}
    try { $Collector.Ps.Dispose(); $Collector.Rs.Dispose() } catch {}
}

function Invoke-Monitor {
    $queue = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
    $ctl = [hashtable]::Synchronized(@{ Stop = $false; LastError = '' })
    $oldCtrlC = [Console]::TreatControlCAsInput
    $oldEnc = [Console]::OutputEncoding
    $collector = $null
    $lastOut = ''
    $esc = $script:Esc
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        try { [Console]::TreatControlCAsInput = $true } catch {}
        [Console]::Out.Write("$esc[?7l$esc[?25l")  # 折り返し無効化 + カーソル非表示

        $collector = Start-Collector $queue $ctl

        # 画面下部で起動してもスクロールで保存座標がズレないよう、キャンバスを確保する
        $size = Get-TermSize
        $reserve = [math]::Max(1, [math]::Min(30, $size.Rows - 1))
        [Console]::Out.Write(("`r`n" * $reserve) + "$esc[${reserve}A")
        [Console]::Out.Write("$esc[s")     # (1) 起点を保存
        [Console]::Out.Flush()

        $latest = @{}
        $vramCaps = @{}
        $prevCols = $size.Cols; $prevRows = $size.Rows
        $resized = $false

        while (-not (Test-QuitKey)) {
            $updated = $false
            $item = $null
            while ($queue.TryDequeue([ref]$item)) { $latest = $item; $updated = $true }

            $size = Get-TermSize
            if ($size.Cols -ne $prevCols -or $size.Rows -ne $prevRows) {
                [Console]::Out.Write("$esc[u$esc[J$esc[s")  # (3)復帰 -> (1)再保存
                $prevCols = $size.Cols; $prevRows = $size.Rows
                $updated = $true
                $resized = $true
            }

            if ($updated -or $lastOut -eq '') {
                $frame = Build-Frame $latest $size.Cols $vramCaps
                if ($frame -ne $lastOut -or $resized) {
                    $lastOut = $frame
                    Write-Screen $lastOut     # (2) 動作
                }
                $resized = $false
            }
            Start-Sleep -Milliseconds 50
        }
    } finally {
        # (3) 最終状態を1回だけ表示して終了
        if ($lastOut -ne '') { Write-Screen $lastOut; [Console]::Out.Write("`r`n") }  # 終了時のみ改行してプロンプトを次行へ
        [Console]::Out.Write("$esc[?7h$esc[?25h")
        [Console]::Out.Flush()
        try { [Console]::TreatControlCAsInput = $oldCtrlC } catch {}
        [Console]::OutputEncoding = $oldEnc
        Stop-Collector $ctl $collector
    }
    return 0
}

# ---------------------------------------------------------------
# エントリポイント
# ---------------------------------------------------------------
$exitCode = 0
try {
    if (-not ('D3dGpuMonitor' -as [type])) {
        try {
            Add-Type -TypeDefinition $script:GpuSource -Language CSharp
        } catch {
            Write-ErrorLine "GPU温度モジュールのコンパイルに失敗(温度は'-'表示): $($_.Exception.Message)"
        }
    }
    $exitCode = Invoke-Monitor
} catch {
    Write-ErrorLine "実行エラー: $($_.Exception.Message)"
    $exitCode = 1
}
exit $exitCode
