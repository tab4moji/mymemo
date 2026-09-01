## WSLを快適にしたい

### WSL の動作優先度を少し落とす

RealTime High AboveNormal Normal BelowNormal Idle

```bash:WSL の動作優先度を少し落とす
pwsh "\$ErrorActionPreference = 'Stop'; try { Get-Process vmmemWSL | ForEach-Object { \$_.PriorityClass = 'BelowNormal'; Write-Host \"Success: \$(\$_.Name) (ID:\$(\$_.Id))\" } } catch { Write-Host \"Error: \$(\$_.Exception.Message)\" }"
echo bfq | sudo tee /sys/block/sdc/queue/scheduler
```

### wsl から pwsh を使う

wsl から powershell や pwsh(powershell7) を呼び出せるようにしておくと [bash から Windows ホストを制御できて便利](./wsl2_with_pwsh.jpg)。

```bash: powershell.exe / pwsh
alias powershell.exe='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
alias pwsh.exe="$(wslpath -u "$(powershell.exe -NoProfile –ExecutionPolicy Bypass -NonInteractive "where.exe pwsh" | iconv -t utf-8 | sed -E 's/\r//g' | tail -1)")"
alias pwsh='_() {
        chcp_com () {
            /mnt/c/Windows/System32/chcp.com "$@" 2>/dev/null
        }

        local_pwsh() {
            local ps1_filename_upath="$1"
            local ps1_filename_upath="$(wslpath -u "${ps1_filename_upath}" 2>/dev/null || echo "${ps1_filename_upath}")"

            if [[ -f "${ps1_filename_upath}" ]]
            then

                shift
                pwsh.exe -NoProfile -NonInteractive –ExecutionPolicy Bypass -Command "$(wslpath -w ${ps1_filename_upath}) "$@"" | sed -E "s/\r//g"
                local exit_status=$?

            elif [[ "$@" != "" ]]
            then

                pwsh.exe -NoProfile -NonInteractive –ExecutionPolicy Bypass -Command "$@" | sed -E "s/\r//g"
                local exit_status=$?

            else

                pwsh.exe -ExecutionPolicy Bypass -NoExit -Command ". \$PROFILE; cd ~/"
                local exit_status=$?
            fi

            return ${exit_status}
        }
        local_pwsh "$@"
    };
    _'
```

### WSLがAdministratorなのかどうか

wsl が Windows の Admin 権限を持っているかどうかを調べておく。

```bash:Admin権限なら True
pwsh "[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
```

### WSL を起動

```pwsh
<#
=============================================================================
目的: WSLの稼働状態に応じたスマート起動を行う
機能:
  - 稼働中のWSLディストリビューションの有無を確認する。
  - 1つも稼働していない場合は、シャットダウンと更新処理を実行してから起動する。
  - 1つでも稼働中の場合は、そのまま起動処理を行う。
更新履歴:
  - 001: 2026-06-30 新規作成
=============================================================================
#>

function Start-WslEnvironment {
    $success = $false
    try {
        # wsl.exeの出力を配列として取得
        $statusOutput = wsl.exe --list --verbose 2>&1

        # ガード節: wslコマンド自体が失敗した場合
        if ($LASTEXITCODE -ne 0) {
            throw "WSLコマンドの実行に失敗した。WSLがインストールされていないか、壊れている可能性がある。"
        }

        # 稼働中のディストリビューションを検索
        $isRunning = $false
        foreach ($line in $statusOutput) {
            # wsl.exeの出力形式(UTF-16LE)に起因するpwshのNull文字混入をサニタイズ
            $cleanLine = $line -replace "`0", ""
            if ($cleanLine -match "\bRunning\b") {
                $isRunning = $true
                break
            }
        }

        # 判定結果に応じた処理の分岐
        if (-not $isRunning) {
            Write-Host "稼働中のディストリビューションはありません。メンテナンスを実行します..."
            wsl.exe --shutdown
            wsl.exe --update
        }

        # WSLのホームディレクトリでデフォルトディストリビューションを起動
        wsl.exe "~"
        $success = $true

    } catch {
        # エラー専用ストリームへ出力
        Write-Error $_.Exception.Message
    }

    return $success
}

# 処理の実行
Start-WslEnvironment
```


### Windows Terminal

#### CTRL-H を Backspace にする

```json:settings.json::actions
{
    "command":
    {
        "action": "sendInput",
        "input": "\u007f"
    },
    "id": "User.sendInput.aa7c4768-3c8b-11f1-aa02-00155d9f13a2"
},
```

```json:settings.json::keybindings
{
    "id": "User.sendInput.aa7c4768-3c8b-11f1-aa02-00155d9f13a2",
    "keys": "ctrl+h"
},
```

参考: [Windows ターミナルでのカスタム アクションとキーバインド](https://learn.microsoft.com/ja-jp/windows/terminal/customize-settings/actions#application-level-commands)

### ネットワーク経路

#### 概要と結論
WSL2のネットワークはWindowsホストから独立した仮想ネットワークにあるため、外部PCから直接WSLのIPアドレスを指定してアクセスすることはできない。

これを実現するには以下の3ステップが必要だ。
1. WSL上でSSHサーバー（`sshd`）を起動する。
2. Windowsホストで `netsh portproxy` を使い、WindowsへのアクセスをWSLへ転送（ポートフォワーディング）する。
3. Windowsのファイアウォールで該当ポートの外部からの通信を許可する。

```bash:💻WindowsホストのIPアドレス
pwsh 'Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.Name -notmatch "vEthernet|Loopback" } | Get-NetIPAddress -AddressFamily IPv4 | Select-Object -ExpandProperty IPAddress' | tr -d '\r'
```

```bash:🐧WSLのWindows内IPアドレス
ip addr | \grep -E "global eth[0-9]" | sed -E 's/[ \t\/:]+/ /g' | cut -d' ' -f3
```

```bash:🔛sshネットワーク開通
pwsh "netsh interface portproxy add v4tov4 listenport=22 listenaddress=0.0.0.0 connectport=22 connectaddress=$(ip addr | \grep -E "global eth[0-9]" | sed -E 's/[ \t\/:]+/ /g' | cut -d' ' -f3)"
pwsh "New-NetFirewallRule -DisplayName 'WSL SSH Forwarding' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22"
pwsh "netsh interface portproxy show v4tov4"
pwsh "Get-NetFirewallRule -DisplayName 'WSL SSH Forwarding'"
```

```bash:ℹ️確認
pwsh 'Get-NetFirewallRule | Where-Object { [string]::IsNullOrWhiteSpace($_.DisplayGroup) } | Select-Object DisplayName, Name, Direction, Action | Format-Table -AutoSize'
pwsh "netsh interface portproxy show v4tov4"
```

```bash:⛔sshネットワーク閉鎖
pwsh "netsh interface portproxy delete v4tov4 listenport=22 listenaddress=0.0.0.0"
pwsh "Remove-NetFirewallRule -DisplayName 'WSL SSH Forwarding'"
pwsh "netsh interface portproxy show v4tov4"
pwsh "Get-NetFirewallRule -DisplayName 'WSL SSH Forwarding'"
```

##### 🔰WSL再起動時の注意点
WSL2はWindowsを再起動したりWSLをシャットダウンしたりするたびに、仮想IPアドレスが変わってしまう仕様だ。
IPが変わるとフォワーディング先が迷子になるため、起動のたびに手順2の `netsh` の `connectaddress` を新しいIPで上書き更新する必要がある。

```bash:🔛ネットワーク開通
_() { local port_number="$1"; pwsh "netsh interface portproxy add v4tov4 listenport=${port_number} listenaddress=0.0.0.0 connectport=${port_number} connectaddress=$(ip addr | \grep -E 'global eth[0-9]' | sed -E 's/[ \t\/:]+/ /g' | cut -d' ' -f3); New-NetFirewallRule -DisplayName 'WSL Port${port_number} Forwarding' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port_number}; netsh interface portproxy show v4tov4; Get-NetFirewallRule -DisplayName 'WSL Port${port_number} Forwarding'"; }; _ 11434
```

```bash:ℹ️確認
pwsh 'Get-NetFirewallRule | Where-Object { [string]::IsNullOrWhiteSpace($_.DisplayGroup) } | Select-Object DisplayName, Name, Direction, Action | Format-Table -AutoSize'
pwsh "netsh interface portproxy show v4tov4"
```

```bash:⛔ネットワーク閉鎖
_() { local port_number="$1"; pwsh "netsh interface portproxy delete v4tov4 listenport=${port_number} listenaddress=0.0.0.0; Remove-NetFirewallRule -DisplayName 'WSL Port${port_number} Forwarding'"; }; _ 11434
```

### モバイルホットスポット

#### wsl からモバイルホットスポットにつなげた**端末 192.168.137.xxx:11434** にローカルゲートウェイ経由でつなげる

```powershell:🔛ローカルと端末を両者の同じポート番号でポートフォワード
& {
  param($ipaddr, $port)
  New-NetFirewallRule -DisplayName "MyPersonalRule" -Direction Inbound -LocalPort $port -Protocol TCP -Action Allow
  netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$ipaddr
} "192.168.137.xxx" 11434
```

```powershell:ℹ️firewall 設定を探す
netsh interface portproxy show v4tov4
Get-NetFirewallRule -DisplayName "MyPersonal*"
```

```powershell:⛔firewall 設定とポートフォワード設定を消す
Remove-NetFirewallRule -DisplayName "MyPersonal*"
netsh interface portproxy show v4tov4 | Select-String "0\.0\.0\.0" | ForEach-Object {
    $port = $_.ToString() -split '\s+' | Where-Object { $_ -ne "" } | Select-Object -Index 1
    if ($port -match '^\d+$') {
        netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port
    }
}
```

```bash:試しに curl でつなげてみる
GATEWAY_IP=$(ip route show | grep default | awk '{print $3}') && echo "Windows Host IP: ${GATEWAY_IP}" && curl -v http://${GATEWAY_IP}:11434
```

#### 手動ですっきりしたいとき

```powershell:ℹ️一覧表示
netsh interface portproxy show v4tov4
```

```powershell:お試し結果
PS C:\> netsh interface portproxy show v4tov4

ipv4 をリッスンする:         ipv4 に接続する:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
192.168.137.115 11434       172.20.4.52     11434
127.0.0.1       11434       172.20.4.52     11434
0.0.0.0         11434       192.168.137.115 11434
```

```powershell:⛔ポートフォワード削除
netsh interface portproxy delete v4tov4 listenaddress=192.168.137.115 listenport=11434
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=11434
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=11434
netsh interface portproxy show v4tov4
```

### /mnt/c/... 邪魔

wslのbashのPATHから、/mnt/c/Users/ だとか、/mnt/c/WINDOWS/System32/ とかを消し去りたい。

```bash
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '/mnt/c/' | paste -sd: -)
```

### vhdx 圧縮

```powershell:compact_vhdx.ps1
#!/usr/bin/env pwsh
<#
.SYNOPSIS
    WSL2 Disk Compactor via Diskpart
.DESCRIPTION
    Reclaims disk space from WSL2 virtual hard disks (vhdx) using Windows diskpart utility.
    Requires Administrator privileges.
.NOTES
    Update History:
    No.2 2026-02-16 Fixed: Replaced non-existent wsl command with diskpart automation.
#>

Set-StrictMode -Version 3.0
$ErrorActionPreference = "Stop"

function Test-Administrator {
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = [System.Security.Principal.WindowsPrincipal]$Identity
    return $Principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WslDistributionInfo {
    [CmdletBinding()]
    param()

    $DistroList = @()
    $LxssPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss"

    try {
        if (-not (Test-Path $LxssPath)) {
            throw "WSL registry key not found at $LxssPath."
        }

        $SubKeys = Get-ChildItem -Path $LxssPath -ErrorAction Stop

        foreach ($Key in $SubKeys) {
            $DistroName = $null
            $BasePath = $null
            $VhdxPath = $null

            if ($Key.Property -contains "DistributionName") {
                $DistroName = Get-ItemProperty -Path $Key.PSPath -Name "DistributionName" | Select-Object -ExpandProperty DistributionName
            }

            if ($Key.Property -contains "BasePath") {
                $BasePath = Get-ItemProperty -Path $Key.PSPath -Name "BasePath" | Select-Object -ExpandProperty BasePath
            }

            if (-not [string]::IsNullOrEmpty($BasePath)) {
                $PotentialPath = Join-Path -Path $BasePath -ChildPath "ext4.vhdx"
                if (Test-Path $PotentialPath) {
                    $VhdxPath = $PotentialPath
                }
            }

            if (-not [string]::IsNullOrEmpty($DistroName) -and -not [string]::IsNullOrEmpty($VhdxPath)) {
                $DistroList += [PSCustomObject]@{
                    Name     = $DistroName
                    VhdxPath = $VhdxPath
                }
            }
        }
    }
    catch {
        Write-Error "Failed to retrieve WSL information: $_"
        $DistroList = @()
    }

    return $DistroList
}

function Format-FileSize {
    [CmdletBinding()]
    param([long]$Bytes)

    $Result = ""
    $Units = @("B", "KiB", "MiB", "GiB", "TiB")
    $Index = 0

    try {
        $Value = [double]$Bytes
        while ($Value -ge 1024 -and $Index -lt ($Units.Count - 1)) {
            $Value /= 1024
            $Index++
        }
        $Result = "{0:N2} {1}" -f $Value, $Units[$Index]
    }
    catch {
        $Result = "0 B"
    }

    return $Result
}

function Invoke-DiskpartCompact {
    [CmdletBinding()]
    param([array]$Distributions)

    $TotalReclaimed = 0
    $ScriptFile = Join-Path -Path $env:TEMP -ChildPath "wsl_compact_script.txt"

    try {
        Write-Host "Shutting down WSL instances..." -ForegroundColor Cyan
        wsl --shutdown
        if ($LASTEXITCODE -ne 0) { throw "Failed to shutdown WSL." }
        Start-Sleep -Seconds 3

        foreach ($Distro in $Distributions) {
            Write-Host "--------------------------------------------------"
            Write-Host "Target: $($Distro.Name)" -ForegroundColor Yellow

            $FileItem = Get-Item -Path $Distro.VhdxPath -ErrorAction Stop
            $SizeBefore = $FileItem.Length

            Write-Host "  Path: $($Distro.VhdxPath)"
            Write-Host "  Size (Before): $(Format-FileSize $SizeBefore)"
            Write-Host "  Compacting via Diskpart..." -NoNewline

            # Create Diskpart script
            $Commands = @"
select vdisk file="$($Distro.VhdxPath)"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@
            Set-Content -Path $ScriptFile -Value $Commands -Encoding Ascii

            # Execute Diskpart
            # $ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
            # $ProcessInfo.FileName = "diskpart.exe"
            # $ProcessInfo.Arguments = "/s `"$ScriptFile`""
            # $ProcessInfo.RedirectStandardOutput = $true
            # $ProcessInfo.RedirectStandardError = $true
            # $ProcessInfo.UseShellExecute = $false
            # $ProcessInfo.CreateNoWindow = $true

            # $Process = [System.Diagnostics.Process]::Start($ProcessInfo)
            $Process = Start-Process -FilePath "diskpart.exe" -ArgumentList "/s `"$ScriptFile`"" -Wait -NoNewWindow -PassThru
            $Process.WaitForExit()

            # Clean up script
            if (Test-Path $ScriptFile) { Remove-Item -Path $ScriptFile -Force }

            if ($Process.ExitCode -eq 0) {
                Write-Host " Done." -ForegroundColor Green

                $FileItem.Refresh()
                $SizeAfter = $FileItem.Length
                $Diff = $SizeBefore - $SizeAfter
                $TotalReclaimed += $Diff

                Write-Host "  Size (After) : $(Format-FileSize $SizeAfter)"
                if ($Diff -gt 0) {
                    Write-Host "  Reclaimed    : $(Format-FileSize $Diff)" -ForegroundColor Cyan
                } else {
                    Write-Host "  No space reclaimed." -ForegroundColor Gray
                }
            } else {
                Write-Host " Failed." -ForegroundColor Red
                Write-Error "Diskpart failed. ExitCode: $($Process.ExitCode)"
                Write-Host $Process.StandardOutput.ReadToEnd()
            }
        }

        Write-Host "=================================================="
        Write-Host "Total Space Reclaimed: $(Format-FileSize $TotalReclaimed)" -ForegroundColor Magenta
        Write-Host "=================================================="
    }
    catch {
        Write-Error "An unexpected error occurred: $_"
    }
}

function Main {
    if (-not (Test-Administrator)) {
        Write-Warning "This script requires Administrator privileges to run diskpart."
        Write-Warning "Please run PowerShell as Administrator."
        return 1
    }

    try {
        Write-Host "Starting WSL Disk Compactor (Diskpart Edition)..." -ForegroundColor Cyan
        $Distros = Get-WslDistributionInfo
        if ($Distros.Count -eq 0) {
            throw "No WSL distributions with valid VHDX files found."
        }
        Invoke-DiskpartCompact -Distributions $Distros
    }
    catch {
        Write-Error $_
        return 1
    }
    return 0
}

$Global:LastExitCode = Main
```

### wsl で USB デバイスをそれなりに使う

#### usbipd-winインストールを試みる(すでに入っていれば修復か更新が走る)

```bash
win_home="$(wslpath -u pwsh -NoProfile -Command "\$env:USERPROFILE")")"; "${win_home%%$'\r'}/AppData/Local/Microsoft/WindowsApps/winget.exe" install usbipd-win
```

#### デバイスをバインドしている

```bash
"/mnt/c/Program Files/usbipd-win/usbipd.exe" bind --busid 2-3
"/mnt/c/Program Files/usbipd-win/usbipd.exe" attach --wsl --busid 2-3
```

### ALSA で音を出したい

```bash
#!/usr/bin/env bash

# ==============================================================================
# WSL2 Sound Setup Script
#
# Description: Automates the configuration of ALSA to work with WSLg PulseAudio.
# Update History:
#   v1.0.0 (2026-01-15): Initial release. Complete checks and idempotency added.
# ==============================================================================

set -u

# --- Colors for output ---
readonly COLOR_RESET="\033[0m"
readonly COLOR_INFO="\033[36m"    # Cyan
readonly COLOR_SUCCESS="\033[32m" # Green
readonly COLOR_WARN="\033[33m"    # Yellow
readonly COLOR_ERR="\033[31m"     # Red

# --- Constants ---
readonly WSLG_SOCKET="/mnt/wslg/PulseServer"
readonly ASOUND_CONF="/etc/asound.conf"
readonly REQUIRED_PACKAGES=("libasound2-plugins" "pulseaudio-utils" "alsa-utils")
readonly BASH_RC="${HOME}/.bashrc"

# --- Functions ---

log_info() {
    echo -e "${COLOR_INFO}[INFO] $1${COLOR_RESET}"
}

log_success() {
    echo -e "${COLOR_SUCCESS}[OK] $1${COLOR_RESET}"
}

log_warn() {
    echo -e "${COLOR_WARN}[WARN] $1${COLOR_RESET}"
}

log_err() {
    echo -e "${COLOR_ERR}[ERROR] $1${COLOR_RESET}" >&2
}

# Check if running inside WSLg environment
check_wslg_env() {
    log_info "Checking WSLg environment..."
    if [[ ! -S "$WSLG_SOCKET" ]]; then
        log_err "WSLg PulseAudio socket not found at $WSLG_SOCKET."
        log_err "Please ensure you are running WSL2 with WSLg support."
        log_err "Try running 'wsl --update' in Windows PowerShell (Admin)."
        exit 1
    fi
    log_success "WSLg environment detected."
}

# Install required packages if missing
install_packages() {
    log_info "Checking required packages..."
    local missing_packages=()

    for pkg in "${REQUIRED_PACKAGES[@]}"; do
        if ! dpkg -l | grep -q "^ii  $pkg "; then
            missing_packages+=("$pkg")
        fi
    done

    if [[ ${#missing_packages[@]} -gt 0 ]]; then
        log_warn "Installing missing packages: ${missing_packages[*]}"
        sudo apt update
        if ! sudo apt install -y "${missing_packages[@]}"; then
            log_err "Failed to install packages."
            exit 1
        fi
        log_success "Packages installed successfully."
    else
        log_success "All required packages are already installed."
    fi
}

# Configure /etc/asound.conf
setup_asound_conf() {
    log_info "Configuring $ASOUND_CONF..."

    # Define the desired configuration content
    local conf_content
    conf_content=$(cat <<EOF
pcm.!default {
    type pulse
    fallback "sysdefault"
    hint {
        show on
        description "Default ALSA Output (currently PulseAudio Sound Server)"
    }
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}
EOF
)

    # Check if file exists and content matches (simple check)
    if [[ -f "$ASOUND_CONF" ]]; then
        # Check if the critical line exists to decide if we need to update
        if grep -q "type pulse" "$ASOUND_CONF" && grep -q "fallback \"sysdefault\"" "$ASOUND_CONF"; then
            log_success "$ASOUND_CONF seems to be already configured. Skipping."
            return 0
        fi

        log_warn "$ASOUND_CONF exists but content differs. Creating backup..."
        sudo cp "$ASOUND_CONF" "${ASOUND_CONF}.bak_$(date +%Y%m%d_%H%M%S)"
    fi

    log_info "Writing configuration to $ASOUND_CONF..."
    # Use tee to write with sudo privileges
    echo "$conf_content" | sudo tee "$ASOUND_CONF" > /dev/null

    if [[ $? -eq 0 ]]; then
        log_success "$ASOUND_CONF configured."
    else
        log_err "Failed to write to $ASOUND_CONF."
        exit 1
    fi
}

# Setup Environment Variable in .bashrc
setup_env_var() {
    log_info "Checking environment variables..."

    local env_line="export PULSE_SERVER=unix:${WSLG_SOCKET}"

    # Check current session
    if [[ "${PULSE_SERVER:-}" != "unix:${WSLG_SOCKET}" ]]; then
        log_warn "Current session PULSE_SERVER is not set correctly."
        export PULSE_SERVER="unix:${WSLG_SOCKET}"
        log_info "Exported PULSE_SERVER for this script execution."
    fi

    # Check .bashrc persistence
    if grep -Fq "$env_line" "$BASH_RC"; then
        log_success ".bashrc already contains PULSE_SERVER configuration."
    else
        log_warn "Adding PULSE_SERVER configuration to $BASH_RC..."
        echo "" >> "$BASH_RC"
        echo "# WSLg Sound Configuration" >> "$BASH_RC"
        echo "$env_line" >> "$BASH_RC"
        log_success "Added to $BASH_RC. Please restart your shell or run 'source ~/.bashrc' later."
    fi
}

# Verify connection
verify_connection() {
    log_info "Verifying PulseAudio connection..."
    if pactl info > /dev/null 2>&1; then
        log_success "Connection to PulseAudio server established!"
    else
        log_err "Failed to connect to PulseAudio server."
        log_err "Please check 'pactl info' manually."
        exit 1
    fi
}

# Sound Test
run_sound_test() {
    echo "---------------------------------------------------"
    log_info "Running sound test (speaker-test)..."
    log_info "You should hear audio from Left and Right channels."
    log_info "Press Ctrl+C to stop manually if it doesn't stop."
    echo "---------------------------------------------------"

    # Run for 2 loops then exit
    speaker-test -t wav -c 2 -l 2

    log_success "Test complete."
}

# --- Main Execution ---

setup_alsa_main() {
    echo "=========================================="
    echo "   WSL2 Sound Setup Automation Script     "
    echo "=========================================="

    check_wslg_env
    install_packages
    setup_asound_conf
    setup_env_var
    verify_connection
    run_sound_test

    echo "=========================================="
    log_success "Setup Finished Successfully!"
    echo "If this is your first run, please execute: source ~/.bashrc"
    echo "=========================================="
}

setup_alsa_main
```

### GPU check with WSL2

```bash
[uv](./?content=uv#OyqTjGcF) run python - << 'EOF'
import ctypes
import struct

dxcore_lib = "/usr/lib/wsl/lib/libdxcore.so"
try:
    dxcore = ctypes.CDLL(dxcore_lib)
except Exception as e:
    print(f"Failed to load {dxcore_lib}: {e}")
    exit(1)

class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_uint32),
        ("Data2", ctypes.c_uint16),
        ("Data3", ctypes.c_uint16),
        ("Data4", ctypes.c_uint8 * 8)
    ]

def make_guid(d1, d2, d3, d4):
    g = GUID()
    g.Data1 = d1
    g.Data2 = d2
    g.Data3 = d3
    for i in range(8):
        g.Data4[i] = d4[i]
    return g

# 基本 IUnknown GUID（必ず全オブジェクトが対応）
IID_IUnknown              = make_guid(0x00000000, 0x0000, 0x0000, [0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46])
IID_IDXCoreAdapterFactory = make_guid(0x78ee5945, 0xc36e, 0x4b13, [0xa6, 0x69, 0x00, 0x5d, 0xd1, 0x1c, 0x0f, 0x06])
IID_IDXCoreAdapterList    = make_guid(0x526c7776, 0x40e9, 0x459b, [0xb7, 0x11, 0xf3, 0x2a, 0xd7, 0x6d, 0xfc, 0x28])
DXCORE_ADAPTER_ATTRIBUTE_D3D12_GRAPHICS = make_guid(0x0c9ece4d, 0x2f6e, 0x4f01, [0x8c, 0x96, 0xe8, 0x9e, 0x33, 0x1b, 0x47, 0xb1])

# 1. Factory の生成
ppFactory = ctypes.c_void_p()
hr = dxcore.DXCoreCreateAdapterFactory(ctypes.byref(IID_IUnknown), ctypes.byref(ppFactory))
if hr != 0:
    hr = dxcore.DXCoreCreateAdapterFactory(ctypes.byref(IID_IDXCoreAdapterFactory), ctypes.byref(ppFactory))
    if hr != 0:
        print(f"DXCoreCreateAdapterFactory failed: {hr:#x}")
        exit(1)

factory_ptr = ppFactory.value
factory_vtable = ctypes.cast(ctypes.cast(factory_ptr, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))

# CreateAdapterList (VTable [3])
CreateAdapterList_t = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(GUID), ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p)
)
CreateAdapterList = CreateAdapterList_t(factory_vtable[3])

ppList = ctypes.c_void_p()
hr = CreateAdapterList(
    factory_ptr, 1, ctypes.byref(DXCORE_ADAPTER_ATTRIBUTE_D3D12_GRAPHICS), ctypes.byref(IID_IUnknown), ctypes.byref(ppList)
)
if hr != 0:
    hr = CreateAdapterList(
        factory_ptr, 1, ctypes.byref(DXCORE_ADAPTER_ATTRIBUTE_D3D12_GRAPHICS), ctypes.byref(IID_IDXCoreAdapterList), ctypes.byref(ppList)
    )

list_ptr = ppList.value
list_vtable = ctypes.cast(ctypes.cast(list_ptr, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))

# GetAdapter (VTable [3]), GetAdapterCount (VTable [4])
GetAdapter_t = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p)
)
GetAdapterCount_t = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.c_void_p)

GetAdapter = GetAdapter_t(list_vtable[3])
GetAdapterCount = GetAdapterCount_t(list_vtable[4])

count = GetAdapterCount(list_ptr)
print(f"=== Pure Linux WSL2 GPU Devices (via libdxcore) ===")
print(f"Detected GPU Count: {count}\n")

# IDXCoreAdapter VTable methods
# [6]=GetProperty, [7]=GetPropertySize
GetProperty_t = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_size_t, ctypes.c_void_p
)
GetPropertySize_t = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_size_t)
)

for i in range(count):
    ppAdapter = ctypes.c_void_p()
    # IID_IUnknown で取得
    hr = GetAdapter(list_ptr, i, ctypes.byref(IID_IUnknown), ctypes.byref(ppAdapter))
    if hr != 0:
        print(f"[{i}] GetAdapter error: {hr:#x}")
        continue
    
    adapter_ptr = ppAdapter.value
    adapter_vtable = ctypes.cast(ctypes.cast(adapter_ptr, ctypes.POINTER(ctypes.c_void_p))[0], ctypes.POINTER(ctypes.c_void_p))
    
    GetProperty = GetProperty_t(adapter_vtable[6])
    GetPropertySize = GetPropertySize_t(adapter_vtable[7])
    
    # 1. DriverDescription (Property 2)
    desc_size = ctypes.c_size_t(0)
    GetPropertySize(adapter_ptr, 2, ctypes.byref(desc_size))
    
    gpu_name = "Unknown Device"
    if desc_size.value > 0:
        desc_buf = ctypes.create_string_buffer(desc_size.value)
        GetProperty(adapter_ptr, 2, desc_size.value, desc_buf)
        gpu_name = desc_buf.value.decode("utf-8", errors="ignore").strip()
    
    # 2. IsIntegrated (Property 12)
    is_integrated = ctypes.c_bool(False)
    GetProperty(adapter_ptr, 12, ctypes.sizeof(is_integrated), ctypes.byref(is_integrated))
    gpu_type = "iGPU (Integrated)" if is_integrated.value else "dGPU (Discrete)"
    
    # 3. DedicatedAdapterMemory (Property 7)
    vram_bytes = ctypes.c_uint64(0)
    GetProperty(adapter_ptr, 7, ctypes.sizeof(vram_bytes), ctypes.byref(vram_bytes))
    vram_gb = vram_bytes.value / (1024 ** 3)
    
    print(f"[{i}] {gpu_name}")
    print(f"    Type : {gpu_type}")
    print(f"    VRAM : {vram_gb:.2f} GB")
EOF
```

### 簡易タスクマネージャー

２つファイルが必要

```python:monitor.py
#!/usr/bin/env python3
"""
目的: WSLからWindowsホストのリソース負荷をリアルタイムに取得・表示するインラインツール。
機能: V2.19 提案された「(1)保存 -> (2)動作 -> (3)復帰」のアーキテクチャに完全リファクタリング。
更新履歴:
- 026: 2026-07-18: カーソル保存(\033[s)と復元(\033[u)をベースにした絶対座標描画ロジックへ変更。
"""
import subprocess
import json
import threading
import queue
import sys
import time
import termios
import tty
import math
import shutil
import select
import os

def make_bar(value: float, width: int = 40) -> str:
    if width < 4: width = 4
    try:
        val = float(value)
        if val < 0: val = 0.0
        if val > 100: val = 100.0

        filled = math.ceil((val / 100.0) * width)
        if filled > width: filled = width
        if filled < 0: filled = 0

        bar = ('█' * filled) + ('░' * (width - filled))
        display_val = math.ceil(val)
        return f"[{bar}] {display_val:>3}%"
    except Exception:
        return f"[{'░' * width}]   0%"

def make_empty_bar(width: int = 40) -> str:
    if width < 4: width = 4
    return f"[{'-' * width}]   -%"

def read_output(proc: subprocess.Popen, data_queue: queue.Queue) -> None:
    try:
        if not proc.stdout: return
        for line in iter(proc.stdout.readline, ''):
            if not line: break
            if line.strip(): data_queue.put(line.strip())
    except Exception:
        pass

def input_thread(stop_event: threading.Event) -> None:
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)

    old_flags = os.get_blocking(fd)
    os.set_blocking(fd, False)

    try:
        tty.setcbreak(fd)
        while not stop_event.is_set():
            try:
                r, _, _ = select.select([sys.stdin], [], [], 0.05)
                if r:
                    char = sys.stdin.read(1)
                    if char and char.lower() == 'q':
                        stop_event.set()
                        break
            except (InterruptedError, BlockingIOError):
                continue
            except Exception:
                break
    finally:
        os.set_blocking(fd, old_flags)
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

def main() -> int:
    try:
        sys.stdout.write("\033[?7l") # 折り返し無効化
        sys.stdout.flush()

        proc = subprocess.Popen(
            ["pwsh", "monitor_win.ps1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8', errors='replace'
        )

        data_queue = queue.Queue()
        stop_event = threading.Event()

        reader_th = threading.Thread(target=read_output, args=(proc, data_queue), daemon=True)
        key_th = threading.Thread(target=input_thread, args=(stop_event,), daemon=True)

        reader_th.start()
        key_th.start()

        latest_data = {}
        vram_max_caps = {}

        # 起動時: ターミナル下部で実行された際に画面がスクロールして
        # 保存座標がズレるのを防ぐため、あらかじめキャンバス(改行)を確保する
        sys.stdout.write("\n" * 20)
        sys.stdout.write("\033[20A")

        # (1) 画面保存: 描画の起点(アンカー)をロック
        sys.stdout.write("\033[s")
        sys.stdout.flush()

        prev_cols, prev_rows = shutil.get_terminal_size((80, 24))
        last_out = ""

        while not stop_event.is_set():
            updated = False
            while not data_queue.empty():
                try:
                    line = data_queue.get_nowait()
                    latest_data = json.loads(line)
                    updated = True
                except Exception:
                    pass

            cols, rows = shutil.get_terminal_size((80, 24))

            # ターミナルサイズ変更が発生した場合
            if cols != prev_cols or rows != prev_rows:
                # (3) 画面復帰して下をクリアし、再度 (1) 画面保存を行う
                sys.stdout.write("\033[u\033[J")
                sys.stdout.write("\033[s")
                sys.stdout.flush()
                prev_cols = cols
                prev_rows = rows
                updated = True # サイズが変わったので強制再描画

            if updated or not last_out:
                safe_cols = cols - 1 if cols > 1 else 1

                if cols >= 68:
                    cpu_chunk = 4
                    cpu_bw = min(8, (cols - 52) // 4)
                elif cols >= 34:
                    cpu_chunk = 2
                    cpu_bw = min(15, (cols - 26) // 2)
                else:
                    cpu_chunk = 1
                    cpu_bw = min(40, max(4, cols - 13))

                if cols >= 45:
                    gpu_combined = True
                    gpu_bw = min(15, (cols - 31) // 2)
                else:
                    gpu_combined = False
                    gpu_bw = min(40, max(4, cols - 17))

                lines = []
                lines.append("=== Windows Host Resource Monitor ===")

                total_cpu = latest_data.get("TotalCPU", 0)
                total_mem = latest_data.get("TotalMEM", 0)
                if gpu_combined:
                    lines.append(f"{'CPU':<10} {make_bar(total_cpu, gpu_bw)}  MEM. {make_bar(total_mem, gpu_bw)}")
                else:
                    lines.append(f"{'CPU':<10} {make_bar(total_cpu, gpu_bw)}")
                    lines.append(f"{'MEM.':<10} {make_bar(total_mem, gpu_bw)}")

                cpus = latest_data.get("CPUs", [])
                for i in range(0, len(cpus), cpu_chunk):
                    chunk = cpus[i:i+cpu_chunk]
                    row_str = ""
                    for j, val in enumerate(chunk):
                        cpu_id = i + j
                        row_str += f"C{cpu_id:02d} {make_bar(val, cpu_bw)}  "
                    lines.append("  " + row_str.rstrip())

                gpus = latest_data.get("GPUs", [])
                if not gpus:
                    if gpu_combined:
                        lines.append(f"{'GPU0':<10} {make_empty_bar(gpu_bw)}  VRAM {make_empty_bar(gpu_bw)}")
                    else:
                        lines.append(f"{'GPU0':<10} {make_empty_bar(gpu_bw)}")
                        lines.append(f"{'VRAM0':<10} {make_empty_bar(gpu_bw)}")
                else:
                    for i, gpu in enumerate(gpus):
                        usage = gpu.get('Usage', 0)
                        vram_mb = gpu.get('VRAM_MB', 0)

                        if i not in vram_max_caps:
                            vram_max_caps[i] = 16384.0
                        if vram_mb > vram_max_caps[i]:
                            vram_max_caps[i] = vram_mb

                        vram_pct = 0
                        if vram_max_caps[i] > 0:
                            vram_pct = (vram_mb / vram_max_caps[i]) * 100.0
                            if vram_pct > 100: vram_pct = 100.0

                        label = f"GPU{i}"
                        if gpu_combined:
                            lines.append(f"{label:<10} {make_bar(usage, gpu_bw)}  VRAM {make_bar(vram_pct, gpu_bw)}")
                        else:
                            lines.append(f"{label:<10} {make_bar(usage, gpu_bw)}")
                            label_vram = f"VRAM{i}"
                            lines.append(f"{label_vram:<10} {make_bar(vram_pct, gpu_bw)}")

                npus = latest_data.get("NPUs", [])
                if not npus:
                    lines.append(f"{'NPU0':<10} {make_empty_bar(gpu_bw)}")
                else:
                    for i, val in enumerate(npus):
                        label = f"NPU{i}"
                        lines.append(f"{label:<10} {make_bar(val, gpu_bw)}")

                disks = latest_data.get("Disks", [])
                if not disks:
                    if gpu_combined:
                        lines.append(f"{'Disk0':<10} {make_empty_bar(gpu_bw)}  CAP. {make_empty_bar(gpu_bw)}")
                    else:
                        lines.append(f"{'Disk0':<10} {make_empty_bar(gpu_bw)}")
                        lines.append(f"{'CAP.0':<10} {make_empty_bar(gpu_bw)}")
                else:
                    for i, disk in enumerate(disks):
                        if isinstance(disk, dict):
                            usage = disk.get('Usage', 0)
                            cap_pct = disk.get('CapPct', 0)
                        else:
                            usage = disk
                            cap_pct = 0

                        label = f"Disk{i}"
                        if gpu_combined:
                            lines.append(f"{label:<10} {make_bar(usage, gpu_bw)}  CAP. {make_bar(cap_pct, gpu_bw)}")
                        else:
                            lines.append(f"{label:<10} {make_bar(usage, gpu_bw)}")
                            label_cap = f"CAP.{i}"
                            lines.append(f"{label_cap:<10} {make_bar(cap_pct, gpu_bw)}")

                lines.append("Press 'q' to quit.")

                last_out = "\n".join([line[:safe_cols] for line in lines]) + "\n"

                # (2) 動作: 毎回起点に復帰(\033[u)し、下をクリア(\033[J)してから描画
                sys.stdout.write("\033[u\033[J")
                sys.stdout.write(last_out)
                sys.stdout.flush()

            time.sleep(0.05)

    finally:
        if 'proc' in locals():
            proc.terminate()

        # (3) 画面復帰 -> 終了
        # 最後に起点に戻ってクリアし、最終状態を1回だけ表示して終了する
        sys.stdout.write("\033[u\033[J")
        if 'last_out' in locals() and last_out:
            sys.stdout.write(last_out)

        sys.stdout.write("\033[?7h") # 折り返し設定を元に戻す
        sys.stdout.flush()

    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.stdout.write("\033[?7h\n")
        sys.stdout.flush()
        sys.exit(0)
```

```powershell:monitor_win.ps1
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
```


### external SDCard

```bash
lsusb | grep -v "Linux Foundation" | grep -v "root hub" || true && pwsh 'usbipd bind --busid 6-1; usbipd attach --wsl --busid 6-1' && sleep 1 && lsusb | grep -v "Linux Foundation" | grep -v "root hub" || true && sudo mkdir -p /mnt/sdcard && sleep 8 && sudo mount $(\ls -alF /dev/sd*1 | sed -E 's/ +/ /g' | cut -d' ' -f10) /mnt/sdcard
```

##
