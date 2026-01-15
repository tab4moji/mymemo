## WSLを快適にしたい

### /mnt/c/... 邪魔

wslのbashのPATHから、/mnt/c/Users/ だとか、/mnt/c/WINDOWS/System32/ とかを消し去りたい。

```bash
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '/mnt/c/' | paste -sd: -)
```

### wsl で USB デバイスをそれなりに使う

```powershell
# 1. もう一度インストールを試みる (すでに入っていれば修復か更新が走る)
winget install usbipd-win

# 2. 上記でエラーが出る、もしくは変化がない場合、場所を指定して実行できるか試す
& "C:\Program Files\usbipd-win\usbipd.exe" list
```

```powershell
& "C:\Program Files\usbipd-win\usbipd.exe" attach --wsl --busid 2-3
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
