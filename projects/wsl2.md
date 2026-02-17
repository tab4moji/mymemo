## WSLを快適にしたい

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
"@
            Set-Content -Path $ScriptFile -Value $Commands -Encoding Ascii

            # Execute Diskpart
            $ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
            $ProcessInfo.FileName = "diskpart.exe"
            $ProcessInfo.Arguments = "/s `"$ScriptFile`""
            $ProcessInfo.RedirectStandardOutput = $true
            $ProcessInfo.RedirectStandardError = $true
            $ProcessInfo.UseShellExecute = $false
            $ProcessInfo.CreateNoWindow = $true

            $Process = [System.Diagnostics.Process]::Start($ProcessInfo)
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

### モバイル ホットスポットとwsl

#### wsl から 192.168.137.115 の 11434 ポートにゲートウェイ経由でつなげる

```powershell
netsh interface portproxy add v4tov4 listenport=11434 listenaddress=0.0.0.0 connectport=11434 connectaddress=192.168.137.115
```

```bash
GATEWAY_IP=$(ip route show | grep default | awk '{print $3}') && echo "Windows Host IP: $GATEWAY_IP" && curl -v http://$GATEWAY_IP:11434
```

#### すっきりしたいとき

```powershell
PS C:\> netsh interface portproxy show v4tov4

ipv4 をリッスンする:         ipv4 に接続する:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
192.168.137.115 11434       172.20.4.52     11434
127.0.0.1       11434       172.20.4.52     11434
0.0.0.0         11435       192.168.137.115 11434
0.0.0.0         11434       192.168.137.115 11434
```

```powershell
netsh interface portproxy show v4tov4
```

```powershell
netsh interface portproxy delete v4tov4 listenaddress=192.168.137.115 listenport=11434
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=11434
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=11435
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=11434
netsh interface portproxy show v4tov4
```

#### 使う必要があるか不明 firewall

```firewall 設定を探す
Get-NetFirewallRule -DisplayName "MyPersnal*"
```

```firewall 設定を消す
Remove-NetFirewallRule -DisplayName "MyPersnal*"
```

```firewall 穴あけの設定をする
New-NetFirewallRule -DisplayName "MyPersonalRule" -Direction Inbound -LocalPort 11434 -Protocol TCP -Action Allow; netsh interface portproxy add v4tov4 listenport=11434 listenaddress=0.0.0.0 connectport=11434 connectaddress=192.168.137.115
```

### Administratorなのかどうか

Admin権限なら True

```bash
"/mnt/c/Program Files/PowerShell/7/pwsh.exe" -Command "[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
```

### wsl で USB デバイスをそれなりに使う

#### usbipd-winインストールを試みる(すでに入っていれば修復か更新が走る)

```bash
win_home="$(wslpath -u "$("/mnt/c/Program Files/PowerShell/7/pwsh.exe" -NoProfile -Command "\$env:USERPROFILE")")"; "${win_home%%$'\r'}/AppData/Local/Microsoft/WindowsApps/winget.exe" install usbipd-win
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
