## Pomera DM200/DM250 (Linux 6.18 / Debian 13 trixie Edition)

### Linux environment for Pomera

[Debian on Pomera DM200/DM250 Update](https://www.ekesete.net/log/?p=9565)

In November 2026, the Debian environment for Pomera DM200/DM250 was completely revamped and updated to be based on Kernel 6.18 and Debian 13 (trixie, armhf).
Accordingly, we cross-build and run the high-performance terminal emulator [kmscon/kmscon](https://github.com/kmscon/kmscon) (MIT License) for the latest environment.

---

### kmscon

#### Pre-built binaries (no warranty)

For those who do not want to set up a cross-build environment, patched pre-built binaries for Linux 6.18 / Debian 13 (trixie, armhf) are provided.
*Note: No warranty. When downloading and using, please comply with the [kmscon license terms](https://github.com/kmscon/kmscon?tab=License-1-ov-file) (MIT License).*

- **kmscon main binary**: [kmscon](./kmscon) (Placement path: `/usr/local/bin/kmscon`)
- **FreeType font module**: [mod-freetype.so](./mod-freetype.so) (Placement path: `/usr/local/lib/kmscon/mod-freetype.so`)
- **Unifont module (for fallback)**: [mod-unifont.so](./mod-unifont.so) (Placement path: `/usr/local/lib/kmscon/mod-unifont.so`)

To download and place them directly on the Pomera, run the following commands:

```bash
# Download and place the main binary
sudo curl -fSL https://tab4moji.github.io/mymemo/kmscon -o /usr/local/bin/kmscon
sudo chmod +x /usr/local/bin/kmscon

# Download and place modules (/usr/local/lib/kmscon/ directory)
sudo mkdir -p /usr/local/lib/kmscon
sudo curl -fSL https://tab4moji.github.io/mymemo/mod-freetype.so -o /usr/local/lib/kmscon/mod-freetype.so
sudo curl -fSL https://tab4moji.github.io/mymemo/mod-unifont.so -o /usr/local/lib/kmscon/mod-unifont.so
```

#### Popular fonts to use

HackGen (はくげん／HackGen) - a programming font that combines Hack and Gen Ju Gothic.
[https://github.com/yuru7/HackGen/releases](https://github.com/yuru7/HackGen/releases)
**Nerd Fonts version**: HackGen_NF_v2.10.0.zip

Since fonts can shift or maintenance may have stopped in fbterm, we cross-build and use kmscon, which can render beautifully with FreeType.

##### Font installation procedure on Pomera
```bash
# Install necessary tools
sudo apt update && sudo apt install -y curl unzip fontconfig

# Create directory for font placement
sudo mkdir -p /usr/local/share/fonts/hackgen

# Download HackGen_NF v2.10.0
curl -fSL https://github.com/yuru7/HackGen/releases/download/v2.10.0/HackGen_NF_v2.10.0.zip -o /tmp/HackGen_NF.zip

# Extract and place HackGen35 related fonts
sudo unzip -j -o /tmp/HackGen_NF.zip "*/HackGen35*" -d /usr/local/share/fonts/hackgen/
rm -f /tmp/HackGen_NF.zip

# Update font cache
sudo fc-cache -fv

# Verify recognition (OK if "HackGen35 Console NF" appears)
fc-list : family | grep "HackGen35"
```

---

### Pomera-specific issues and fixes discovered this time

#### 1. LCD patch (`depths[]`) is no longer needed
In the old environment (Kernel 3.10), the driver was dedicated to 16bpp, so we applied a `depths[] = {16, 0}` patch to avoid the screen hanging during a 32bpp probe.
In Linux 6.18, the DRM subsystem (`rockchip-drm`) and 32bpp native framebuffer (`rockchipdrmfb`, 1024x600 32bpp) are operational, so **the LCD patch is no longer needed (the original code is fine)**.

#### 2. Patch to resolve modifier keys (Shift, Ctrl, Alt) not working [EXTREMELY IMPORTANT]
Due to the hardware design of the Pomera DM200/DM250, character keys and modifier keys are physically on different chips/devices:
- **Character keys (A-Z, numbers, etc.)**: `/dev/input/event0` (`tc3589x-keypad`)
- **Modifier keys (Shift, Ctrl, Alt)**: `/dev/input/event2` (`keyboard-modifiers`)

The standard Linux kernel console synthesizes these globally, but kmscon's input processing is designed to manage "individual keyboard states (`xkb_state`) per device."
Consequently, **even if Shift is pressed on the modifier key device, it does not reach the character key device, causing Shift, Ctrl, or Alt keys not to work (you cannot type uppercase or symbols, making password login impossible)**.

To solve this, we apply a patch that synchronizes key press/release (DOWN/UP) events across all input devices on the same sheet.

```patch:src/input/input_uxkb.c
diff --git a/src/input/input_uxkb.c b/src/input/input_uxkb.c
index 4ced617..75c48d9 100644
--- a/src/input/input_uxkb.c
+++ b/src/input/input_uxkb.c
@@ -517,10 +517,23 @@ int uxkb_dev_process(struct input_dev *dev, uint16_t key_state, uint16_t code)
 	}
 
 	changed = 0;
-	if (key_state == KEY_PRESSED)
+	if (key_state == KEY_PRESSED) {
+		struct shl_dlist *iter;
+		/* Sync state across all keyboard devices */
+		changed = xkb_state_update_key(state, keycode, XKB_KEY_DOWN);
+		shl_dlist_for_each(iter, &dev->input->devices) {
+			struct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);
+			if (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)
+				xkb_state_update_key(target->state, keycode, XKB_KEY_DOWN);
+		}
+	} else if (key_state == KEY_RELEASED) {
+		struct shl_dlist *iter;
+		changed = xkb_state_update_key(state, keycode, XKB_KEY_UP);
+		shl_dlist_for_each(iter, &dev->input->devices) {
+			struct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);
+			if (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)
+				xkb_state_update_key(target->state, keycode, XKB_KEY_UP);
+		}
+	}
 
-	else if (key_state == KEY_RELEASED)
-		changed = xkb_state_update_key(state, keycode, XKB_KEY_UP);
-
 	if (changed & XKB_STATE_LEDS)
 		uxkb_dev_update_keyboard_leds(dev);
```

#### 3. Immediate activation patch for first startup (no need for VT switching)
The `fbdev` backend of kmscon had a flaw in its initialization logic: "it only performs mode-set/activation of the screen when it receives a VT switching (`wake_up`) signal."
Because of this, previously "the screen would remain black upon startup, requiring switching to another VT first to display anything."

By applying a patch that calls `display_activate_force` immediately upon initialization completion (`intro_idle_event`), **the screen will be displayed immediately upon startup without any VT switching needed**.

```patch:src/video/fbdev_video.c
diff --git a/src/video/fbdev_video.c b/src/video/fbdev_video.c
index a30250a..f091c20 100644
--- a/src/video/fbdev_video.c
+++ b/src/video/fbdev_video.c
@@ -458,6 +458,10 @@ static void intro_idle_event(struct ev_eloop *eloop, void *unused, void *data)
 		ev_eloop_rm_timer(dfb->vblank_timer);
 		return;
 	}
+	if (video->flags & VIDEO_AWAKE) {
+		display_activate_force(disp, true);
+		display_set_dpms(disp, DPMS_ON);
+	}
 	display_ready(disp);
 	display_unref(disp);
 }
```

#### 4. Precautions during startup
1. **Specify `--no-drm`**:
   The `--no-drm` option, which uses the 32bpp native framebuffer (`rockchipdrmfb`), is more stable for screen initialization than the direct DRM/KMS mode (`drm2d`).
2. **Do NOT specify `--gpus=primary`**:
   Because the built-in display on the Pomera is a Platform bus device rather than a PCI device, it does not receive a `primary` designation from udev. If `--gpus=primary` is specified, the screen device count becomes zero, resulting in a blackout.

---

### Cross-build script (`build_kmscon_armhf.sh`)

Sets up a Debian 13 (trixie) + armhf cross-build environment using Docker and builds kmscon v10.0.2.

```bash:build_kmscon_armhf.sh
#!/usr/bin/env bash
#
# For DM200/DM250 (Debian 13 trixie, Linux 6.18, armhf)
# Cross-builds kmscon v10.0.2 using Docker (Debian trixie + armhf cross-toolchain).
# Run on Docker on WSL2 / Linux.
#
# Features:
#   - Based on Debian 13 (trixie)
#   - Supports Linux 6.18 32bpp native framebuffer
#   - Applies patch for Pomera's physical split keyboard (char + modifier keys)
#   - Enables font_freetype (for TTF fonts like HackGen)
#
# Usage:
#   chmod +x build_kmscon_armhf.sh
#   ./build_kmscon_armhf.sh
#
set -euo pipefail

WORKDIR="$(pwd)/kmscon-build"
OUTDIR="$(pwd)/output"
IMAGE_TAG="kmscon-armhf-builder:trixie"
KMSCON_TAG="v10.0.2"

mkdir -p "${WORKDIR}" "${OUTDIR}"

# -----------------------------------------------------------------------------
# 1. Dockerfile: Debian 13 (trixie) + armhf development packages
# -----------------------------------------------------------------------------
cat > "${WORKDIR}/Dockerfile" <<'EOF'
FROM debian:trixie

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg --add-architecture armhf && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        crossbuild-essential-armhf \
        pkgconf \
        pkg-config \
        ninja-build \
        meson \
        python3 \
        git \
        ca-certificates \
        file \
        libxkbcommon-dev:armhf \
        libudev-dev:armhf \
        libdrm-dev:armhf \
        zlib1g-dev \
        zlib1g-dev:armhf \
        libfreetype6-dev:armhf \
        libfontconfig1-dev:armhf \
        libtsm-dev:armhf \
    && rm -rf /var/lib/apt/lists/*

ENV PKG_CONFIG_PATH=/usr/lib/arm-linux-gnueabihf/pkgconfig:/usr/share/pkgconfig
ENV PKG_CONFIG_PATH_FOR_BUILD=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig

WORKDIR /work
EOF

# -----------------------------------------------------------------------------
# 2. meson cross file
# -----------------------------------------------------------------------------
cat > "${WORKDIR}/armhf-cross.txt" <<'EOF'
[binaries]
c = 'arm-linux-gnueabihf-gcc'
cpp = 'arm-linux-gnueabihf-g++'
ar = 'arm-linux-gnueabihf-ar'
strip = 'arm-linux-gnueabihf-strip'
pkg-config = 'pkg-config'
ld = 'arm-linux-gnueabihf-ld'

[host_machine]
system = 'linux'
cpu_family = 'arm'
cpu = 'armv7hf'
endian = 'little'

[built-in options]
c_args = ['-mfpu=vfpv3-d16', '-mfloat-abi=hard']
c_link_args = ['-mfloat-abi=hard']
EOF

# -----------------------------------------------------------------------------
# 3. Build script to run inside the container
# -----------------------------------------------------------------------------
cat > "${WORKDIR}/do_build.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

KMSCON_TAG="\${KMSCON_TAG}"

cd /work
if [ ! -d kmscon ]; then
    git clone --depth 1 --branch "\${KMSCON_TAG}" https://github.com/kmscon/kmscon.git
fi
cd kmscon

# Linux 6.18 + DRM (rockchipdrmfb) is 32bpp native, so the old 16bpp patch is not needed
git checkout src/video/fbdev_video.c 2>/dev/null || true

# Pomera-specific issue: Since character keys (tc3589x) and modifier keys (keyboard-modifiers) 
# are different devices, apply a patch to sync XKB state key press/release across all input devices.
if ! grep -q "Sync state across all keyboard devices" src/input/input_uxkb.c; then
    sed -i '/if (key_state == KEY_PRESSED)/,/else if (key_state == KEY_RELEASED)/c\\
	if (key_state == KEY_PRESSED) {\\
		struct shl_dlist *iter;\\
		/* Sync state across all keyboard devices */\\
		changed = xkb_state_update_key(state, keycode, XKB_KEY_DOWN);\\
		shl_dlist_for_each(iter, &dev->input->devices) {\\
			struct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);\\
			if (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)\\
				xkb_state_update_key(target->state, keycode, XKB_KEY_DOWN);\\
		}\\
	} else if (key_state == KEY_RELEASED) {\\
		struct shl_dlist *iter;\\
		changed = xkb_state_update_key(state, keycode, XKB_KEY_UP);\\
		shl_dlist_for_each(iter, &dev->input->devices) {\\
			struct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);\\
			if (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)\\
				xkb_state_update_key(target->state, keycode, XKB_KEY_UP);\\
		}\\
	}' src/input/input_uxkb.c
    echo "==> Applied modifier key synchronization patch to input_uxkb.c"
fi

rm -rf build

meson setup build \\
    --cross-file /work/armhf-cross.txt \\
    --buildtype=release \\
    -Dvideo_fbdev=enabled \\
    -Dvideo_drm2d=enabled \\
    -Dvideo_drm3d=disabled \\
    -Drenderer_gltex=disabled \\
    -Dlibseat=disabled \\
    -Dfont_unifont=enabled \\
    -Dfont_freetype=enabled \\
    -Dfont_psf=disabled \\
    -Dtests=false \\
    -Dlibtsm:tests=false \\
    -Dlibtsm:gtktsm=false \\
    --wrap-mode=default

ninja -C build

KMSCON_BIN="build/src/kmscon"

mkdir -p /out
cp "\${KMSCON_BIN}" /out/kmscon
find build/src/font -name "mod-*.so" -exec cp {} /out/ \\;
EOF
chmod +x "${WORKDIR}/do_build.sh"

# -----------------------------------------------------------------------------
# 4. Image build & Container execution
# -----------------------------------------------------------------------------
echo "==> Building Docker image (${IMAGE_TAG})"
docker build -t "${IMAGE_TAG}" "${WORKDIR}"

echo "==> Cross-building kmscon ${KMSCON_TAG} inside the container"
docker run --rm \
    -v "${WORKDIR}:/work" \
    -v "${OUTDIR}:/out" \
    "${IMAGE_TAG}" \
    /work/do_build.sh

echo "==> Done. Generated artifacts:"
ls -lh "${OUTDIR}"
```

---

### Setup and startup on Pomera

#### 1. Install dependency libraries
```bash
sudo apt update && sudo apt install -y \
    libxkbcommon0 \
    libudev1 \
    libdrm2 \
    xkb-data \
    curl \
    unzip \
    fontconfig
```

#### 2. File placement (Custom build or download)
Transfer the artifacts generated by your custom build (`output/kmscon`, `output/mod-*.so`) or place the previously mentioned pre-built binaries:

```bash
# [If custom built] Transfer from PC
scp output/kmscon output/mod-*.so pi@<pomera-ip>:~/kmscon/

# [Common] Place binaries and modules into system paths on Pomera
# 1. Main binary (/usr/local/bin/)
sudo cp ~/kmscon/kmscon /usr/local/bin/kmscon
sudo chmod +x /usr/local/bin/kmscon

# 2. Font engine modules (/usr/local/lib/kmscon/) *Required for FreeType
sudo mkdir -p /usr/local/lib/kmscon
sudo cp ~/kmscon/mod-*.so /usr/local/lib/kmscon/
```

#### 3. Configuration for automatic startup on VT1 at power-on (systemd service)

To have kmscon (with HackGen font) start on VT1 immediately after powering on the Pomera, we register `kmsconvt@.service`.

```bash
# Create the unit file
cat << 'EOF' | sudo tee /etc/systemd/system/kmsconvt@.service
[Unit]
Description=KMS System Console on %I
Documentation=man:kmscon(1)
After=systemd-user-sessions.service plymouth-quit-wait.service rc-local.service
Before=getty.target
Conflicts=getty@%i.service
OnFailure=getty@%i.service
IgnoreOnIsolate=yes
ConditionPathExists=/dev/tty0

[Service]
ExecStart=/usr/local/bin/kmscon --vt=%I --no-drm --font-name 'HackGen35 Console NF' --font-engine freetype --font-size 14 --term xterm-256color --xkb-model jp106 --xkb-layout jp --no-libseat --grab-zoom-in='<Ctrl>semicolon,<Ctrl><Shift>plus,<Ctrl>plus'
UtmpIdentifier=%I
TTYPath=/dev/%I
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
Restart=always

[Install]
Alias=autovt@.service
WantedBy=getty.target
DefaultInstance=tty1
EOF

# Disable getty@tty1 and enable kmsconvt@tty1
sudo systemctl daemon-reload
sudo systemctl disable getty@tty1.service
sudo systemctl enable kmsconvt@tty1.service

# Start the service (to run it immediately)
sudo systemctl start kmsconvt@tty1.service
```

This allows the beautiful HackGen35 font console to be displayed instantly on the full screen upon startup, without manual VT switching.

*Note: **Font size change shortcuts**:
- `Ctrl + ;` (or `Ctrl + Shift + ;`): Zoom in
- `Ctrl + -`: Zoom out
- `Ctrl + 0`: Reset to default size (`14`) (※ with `--grab-zoom-reset` patch integrated)*

---

### Operation Check (256 Color Test)

After logging in, you can check by displaying a 256-color bar with the following command:

```bash
bash -c 'for i in {0..255}; do printf "\x1b[48;5;%dm%3d\x1b[0m " "$i"; (((i+1)%16==0)) && echo; done'
```

---

### Japanese input environment (limited to `tmux` via `uim-fep` + `Mozc`)

Instead of keeping an IME resident in the raw console (kmscon), we **enable Mozc only inside `tmux` (per pane)**.
Also, by starting `tmux` with a prefix of `Ctrl+\`, it won't conflict with `Ctrl+b` or the `Ctrl+z` used in remote SSH `tmux` sessions.

```text
Power on → kmscon (VT1) → login
  └─ Auto-started via ~/.profile: tmux (main session)
       └─ Inside tmux pane only: ~/.local/bin/tmux-uim-fep
            ├─ uim-fep -u mozc -s backtick (Mozc Japanese input)
            └─ Real-time status updates via uim-fep-tick to the bottom line
```

#### 1. Install `uim-fep` and `uim-mozc`
We install them with `--no-install-recommends` to avoid unnecessary GUI packages like Qt/GTK:

```bash
sudo apt update
sudo apt install -y --no-install-recommends \
    tmux uim-fep uim-mozc mozc-server mozc-data
```

#### 2. `.uim` configuration
Set the default input method to `mozc` and enable ON/OFF with `Ctrl+Space` or `Hankaku/Zenkaku`:

```scheme
(define default-im-name 'mozc)
(define-key generic-on-key? '("<Control> " "zenkaku-hankaku"))
(define-key generic-off-key? '("<Control> " "zenkaku-hankaku"))
```

#### 3. Status bar integration scripts (`~/.local/bin/`)
Since `uim-fep -s backtick` works by having `uim-fep-tick` create a socket, we start `uim-fep-tick` first to reflect the conversion state and candidates immediately in the `tmux` bottom status bar.

```bash
mkdir -p ~/.local/bin

# Pane-level uim-fep + real-time status update wrapper
cat << 'EOF' > ~/.local/bin/tmux-uim-fep
#!/bin/bash
PANE_NUM="${TMUX_PANE#%}"
SOCK="/tmp/uim-fep-${PANE_NUM}"
STAT="/tmp/uim-fep-status-${PANE_NUM}"
rm -f "$SOCK" "$STAT"
echo "mozc" > "$STAT"

(
    LAST_MODE="mozc"
    stdbuf -o0 uim-fep-tick -s "$SOCK" 2>/dev/null | while IFS= read -r line; do
        if [[ "$line" =~ ^[a-zA-Z0-9_-]+\[.*\]$ ]]; then
            LAST_MODE="$line"
            printf "%s\n" "$LAST_MODE" > "$STAT"
        else
            printf "%s %s\n" "$LAST_MODE" "$line" > "$STAT"
        fi
        tmux refresh-client -S 2>/dev/null || true
    done
) &
WATCHER_PID=$!

for _ in $(seq 1 30); do
    [ -S "$SOCK" ] && break
    sleep 0.05
done

cleanup() {
    kill "$WATCHER_PID" 2>/dev/null || true
    rm -f "$SOCK" "$STAT"
}
trap cleanup EXIT

uim-fep -u mozc -s backtick -b "$SOCK"
EOF
chmod +x ~/.local/bin/tmux-uim-fep

# Right side: JST time + Nerd Font battery icon (10 stages + charging icon)
cat << 'EOF' > ~/.local/bin/tmux-status-right
#!/bin/bash
CAP=$(cat /sys/class/power_supply/BATTERY/capacity 2>/dev/null || echo "0")
STAT=$(cat /sys/class/power_supply/BATTERY/status 2>/dev/null)

if [ "$STAT" = "Charging" ]; then
    ICON="󰂄"
elif [ "$CAP" -ge 95 ]; then ICON="󰁹"
elif [ "$CAP" -ge 85 ]; then ICON="󰂂"
elif [ "$CAP" -ge 75 ]; then ICON="󰁁"
elif [ "$CAP" -ge 65 ]; then ICON="󰂀"
elif [ "$CAP" -ge 55 ]; then ICON="󰁿"
elif [ "$CAP" -ge 45 ]; then ICON="󰁾"
elif [ "$CAP" -ge 35 ]; then ICON="󰁽"
elif [ "$CAP" -ge 25 ]; then ICON="󰁼"
elif [ "$CAP" -ge 15 ]; then ICON="󰁻"
elif [ "$CAP" -ge 5 ];  then ICON="󰁺"
else ICON="󰂎"
fi

TIME=$(TZ=Asia/Tokyo date "+%m/%d %H:%M JST")
echo "${TIME} ${ICON} ${CAP}%"
EOF
chmod +x ~/.local/bin/tmux-status-right
```

#### 4. `.tmux.conf` configuration
- Set the `tmux` prefix to **`Ctrl+\` (`C-\`)** to avoid conflict with `Ctrl+b` (other apps) and `Ctrl+z` (remote `tmux`, etc.).
- Configure `default-command` to launch `tmux-uim-fep` only inside panes.
- Display only one line at the bottom: left side shows `[mozc...]`, right side shows `[MM/DD HH:MM JST 󰁾 xx%]` (hiding the window list like `0:bash`).

```tmux
# Default terminal
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Use Ctrl+\ as prefix so Ctrl+b and Ctrl+z (remote tmux) pass through cleanly
unbind C-b
unbind C-z
set -g prefix "C-\\"
bind "C-\\" send-prefix

# Run uim-fep (mozc) inside tmux panes only
set-option -g default-command "$HOME/.local/bin/tmux-uim-fep"

# Bottom-most 1 line status bar: <<mozc    JST time + battery>>
set -g status on
set -g status-position bottom
set -g status-interval 10
set -g status-style "bg=colour235,fg=colour255"

set -g status-left-length 80
set -g status-left "#[fg=colour46,bold]#(cat /tmp/uim-fep-status-#{s/%//:pane_id} 2>/dev/null || echo 'mozc')#[default] "

set -g status-right-length 50
set -g status-right "#[fg=colour220]#($HOME/.local/bin/tmux-status-right)#[default]"

# Hide window list (no 0:bash)
set -g window-status-format ""
set -g window-status-current-format ""

# Mouse & vi copy mode
set -g mouse on
setw -g mode-keys vi
```

#### 5. Auto-start `tmux` upon local login (`~/.profile`)
To ensure `tmux` starts automatically when logging in from the local kmscon (and not when connecting via SSH), add the following to the end of `~/.profile`:

```bash
# Auto-start tmux on local kmscon login (Mozc runs inside tmux only)
if [ -z "$TMUX" ] && [ -z "$SSH_CONNECTION" ] && [ -z "$SSH_TTY" ] && [ -t 0 ]; then
    tmux new-session -A -s main
fi
```

With this, from power-on to login, a comfortable Japanese-inputting console with a bottom line showing Mozc status, JST time, and battery gauge will be ready.
(`Ctrl+\ d` can be used to detach from `tmux` and return to the raw console without Mozc.)
