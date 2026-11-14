## Pomera DM200/DM250 (Linux 6.18 / Debian 13 trixie 版)

### Pomera 用の linux 環境

[Debian on Pomera DM200/DM250 更新](https://www.ekesete.net/log/?p=9565)

2026年11月、Pomera DM200/DM250 向けの Debian 環境が全面刷新され、Kernel 6.18 および Debian 13 (trixie, armhf) ベースにアップデートされました。
これに合わせて、高機能ターミナルエミュレータ [kmscon/kmscon](https://github.com/kmscon/kmscon) (MIT License) を最新環境向けにクロスビルドして動かします。

---

### kmscon

#### ビルド済みバイナリ（無保証）

クロスビルド環境の構築が不要な方向けに、Linux 6.18 / Debian 13 (trixie, armhf) 向けにパッチ適用済みのビルド済みバイナリを配置しています。
※ 無保証です。ダウンロードして利用する場合は必ず [kmscon ライセンス条項](https://github.com/kmscon/kmscon?tab=License-1-ov-file) (MIT License) を遵守してください。

- **kmscon 本体バイナリ**: [kmscon](./kmscon) (配置パス: `/usr/local/bin/kmscon`)
- **FreeType フォントモジュール**: [mod-freetype.so](./mod-freetype.so) (配置パス: `/usr/local/lib/kmscon/mod-freetype.so`)
- **Unifont モジュール (フォールバック用)**: [mod-unifont.so](./mod-unifont.so) (配置パス: `/usr/local/lib/kmscon/mod-unifont.so`)

Pomera 側で直接ダウンロードして配置する場合は以下のコマンドを実行します：

```bash
# 本体バイナリのダウンロードと配置
sudo curl -fSL https://tab4moji.github.io/mymemo/kmscon -o /usr/local/bin/kmscon
sudo chmod +x /usr/local/bin/kmscon

# モジュールのダウンロードと配置 (/usr/local/lib/kmscon/ ディレクトリへ)
sudo mkdir -p /usr/local/lib/kmscon
sudo curl -fSL https://tab4moji.github.io/mymemo/mod-freetype.so -o /usr/local/lib/kmscon/mod-freetype.so
sudo curl -fSL https://tab4moji.github.io/mymemo/mod-unifont.so -o /usr/local/lib/kmscon/mod-unifont.so
```

#### 使いたい有名フォント

Hack と源柔ゴシックを合成したプログラミングフォント 白源 (はくげん／HackGen)
[https://github.com/yuru7/HackGen/releases](https://github.com/yuru7/HackGen/releases)
**Nerd Fonts 合成版**: HackGen_NF_v2.10.0.zip

fbterm だとフォントがズレて表示されたりメンテが止まっていたりするので、FreeType で美しくレンダリングできる kmscon をクロスビルドして使います。

##### Pomera 側でのフォント導入手順
```bash
# 必要なツールの導入
sudo apt update && sudo apt install -y curl unzip fontconfig

# フォント配置用ディレクトリの作成
sudo mkdir -p /usr/local/share/fonts/hackgen

# HackGen_NF v2.10.0 のダウンロード
curl -fSL https://github.com/yuru7/HackGen/releases/download/v2.10.0/HackGen_NF_v2.10.0.zip -o /tmp/HackGen_NF.zip

# HackGen35 関連フォントを展開して配置
sudo unzip -j -o /tmp/HackGen_NF.zip "*/HackGen35*" -d /usr/local/share/fonts/hackgen/
rm -f /tmp/HackGen_NF.zip

# フォントキャッシュを更新
sudo fc-cache -fv

# 認識確認 (「HackGen35 Console NF」と出ればOK)
fc-list : family | grep "HackGen35"
```

---

### 今回判明した Pomera 固有の問題と対応

#### 1. 液晶用パッチ (`depths[]`) は不要になった
旧環境 (Kernel 3.10) では 16bpp 専用ドライバだったため、32bpp プローブで画面がハングアップする問題を回避する `depths[] = {16, 0}` パッチを当てていました。
Linux 6.18 では DRM サブシステム (`rockchip-drm`) および 32bpp ネイティブのフレームバッファ (`rockchipdrmfb`, 1024x600 32bpp) が稼働しているため、**液晶用のパッチは不要（オリジナルのコードのままでOK）**になりました。

#### 2. 修飾キー (Shift, Ctrl, Alt) が効かない問題の解決パッチ【超重要】
Pomera DM200/DM250 はハードウェア設計上、文字キーと修飾キーが物理的に別チップ／別デバイスに分かれています：
- **文字キー (A〜Z, 数字など)**: `/dev/input/event0` (`tc3589x-keypad`)
- **修飾キー (Shift, Ctrl, Alt)**: `/dev/input/event2` (`keyboard-modifiers`)

Linux カーネルの標準コンソールはこれらをグローバルに合成しますが、kmscon の入力処理は「デバイスごとに個別のキーボード状態 (`xkb_state`)」を管理する設計になっています。
このため、**修飾キーデバイス側で Shift を押しても文字キーデバイス側に Shift が届かず、Shift キーや Ctrl/Alt が効かない（大文字や記号が打てずパスワードログインできない）** という現象が発生します。

これを解決するため、キーの押下・解除（DOWN/UP）イベントを同一シート内の全入力デバイス間で同期するパッチを適用します。

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
 		changed = xkb_state_update_key(state, keycode, XKB_KEY_DOWN);
-	else if (key_state == KEY_RELEASED)
+		shl_dlist_for_each(iter, &dev->input->devices) {
+			struct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);
+			if (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)
+				xkb_state_update_key(target->state, keycode, XKB_KEY_DOWN);
+		}
+	} else if (key_state == KEY_RELEASED) {
+		struct shl_dlist *iter;
 		changed = xkb_state_update_key(state, keycode, XKB_KEY_UP);
+		shl_dlist_for_each(iter, &dev->input->devices) {
+			struct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);
+			if (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)
+				xkb_state_update_key(target->state, keycode, XKB_KEY_UP);
+		}
+	}
 
 	if (changed & XKB_STATE_LEDS)
 		uxkb_dev_update_keyboard_leds(dev);
```

#### 3. 初回起動時の即時アクティベーションパッチ (VT切り替え不要化)
kmscon の `fbdev` バックエンドには「VT 切り替え（`wake_up`）のシグナルを受け取った時にしか画面のモードセット・アクティベーションを行わない」という初期化ロジックの不備がありました。
このため、以前は「起動直後は画面が真っ暗で、一度別の VT を挟まないと表示されない」という現象が起きていました。

初期化完了時（`intro_idle_event`）に即座に `display_activate_force` を呼ぶパッチを適用することで、**VT 切り替えを一切挟まず、起動した瞬間に即座に画面が表示される** ようになります。

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

#### 4. 起動時の注意点
1. **`--no-drm` を指定する**:
   DRM/KMS 直接モード (`drm2d`) よりも、32bpp ネイティブフレームバッファ (`rockchipdrmfb`) を使う `--no-drm` の方が安定して画面を初期化できます。
2. **`--gpus=primary` は指定しない**:
   Pomera 内蔵のディスプレイは PCI ではなく Platform バスデバイスのため、udev の `primary` 判定が付きません。`--gpus=primary` を付けると画面デバイスがゼロ個になってブラックアウトします。

---

### クロスビルドスクリプト (`build_kmscon_armhf.sh`)

Debian 13 (trixie) + armhf クロス環境を Docker で構築し、kmscon v10.0.2 をビルドします。

```bash:build_kmscon_armhf.sh
#!/usr/bin/env bash
#
# DM200/DM250 (Debian 13 trixie, Linux 6.18, armhf) 向けに
# kmscon v10.0.2 を Docker (Debian trixie + armhf クロスツールチェーン) で
# クロスビルドするスクリプト。WSL2 / Linux 上の Docker で実行する。
#
# 特徴:
#   - Debian 13 (trixie) ベース
#   - Linux 6.18 の 32bpp ネイティブフレームバッファに対応
#   - Pomera の物理分離キーボード (文字キー + 修飾キー) 対応パッチを適用
#   - font_freetype を有効化 (HackGen等のTTFフォント用)
#
# 使い方:
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
# 1. Dockerfile: Debian 13 (trixie) + armhf 開発パッケージ
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
# 2. meson クロスファイル
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
# 3. コンテナ内で実行するビルドスクリプト
# -----------------------------------------------------------------------------
cat > "${WORKDIR}/do_build.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

KMSCON_TAG="${KMSCON_TAG}"

cd /work
if [ ! -d kmscon ]; then
    git clone --depth 1 --branch "\${KMSCON_TAG}" https://github.com/kmscon/kmscon.git
fi
cd kmscon

# Linux 6.18 + DRM (rockchipdrmfb) は 32bpp ネイティブのため、旧 16bpp パッチは不要
git checkout src/video/fbdev_video.c 2>/dev/null || true

# Pomera 固有問題対策: 文字キー (tc3589x) と修飾キー (keyboard-modifiers) が別デバイスのため、
# 全入力デバイス間で XKB state のキー押下・解除を同期させるパッチを適用
if ! grep -q "Sync state across all keyboard devices" src/input/input_uxkb.c; then
    sed -i '/if (key_state == KEY_PRESSED)/,/else if (key_state == KEY_RELEASED)/c\\
\tif (key_state == KEY_PRESSED) {\\
\t\tstruct shl_dlist *iter;\\
\t\t/* Sync state across all keyboard devices */\\
\t\tchanged = xkb_state_update_key(state, keycode, XKB_KEY_DOWN);\\
\t\tshl_dlist_for_each(iter, &dev->input->devices) {\\
\t\t\tstruct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);\\
\t\t\tif (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)\\
\t\t\t\txkb_state_update_key(target->state, keycode, XKB_KEY_DOWN);\\
\t\t}\\
\t} else if (key_state == KEY_RELEASED) {\\
\t\tstruct shl_dlist *iter;\\
\t\tchanged = xkb_state_update_key(state, keycode, XKB_KEY_UP);\\
\t\tshl_dlist_for_each(iter, &dev->input->devices) {\\
\t\t\tstruct input_dev *target = shl_dlist_entry(iter, struct input_dev, list);\\
\t\t\tif (target != dev && (target->capabilities & DEVICE_HAS_KEYS) && target->state)\\
\t\t\t\txkb_state_update_key(target->state, keycode, XKB_KEY_UP);\\
\t\t}\\
\t}' src/input/input_uxkb.c
    echo "==> input_uxkb.c に修飾キー同期パッチを適用しました"
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
# 4. イメージビルド & コンテナ実行
# -----------------------------------------------------------------------------
echo "==> Dockerイメージをビルドします (${IMAGE_TAG})"
docker build -t "${IMAGE_TAG}" "${WORKDIR}"

echo "==> コンテナ内で kmscon ${KMSCON_TAG} をクロスビルドします"
docker run --rm \
    -v "${WORKDIR}:/work" \
    -v "${OUTDIR}:/out" \
    "${IMAGE_TAG}" \
    /work/do_build.sh

echo "==> 完了。生成物:"
ls -lh "${OUTDIR}"
```

---

### Pomera 側でのセットアップと起動方法

#### 1. 依存ライブラリの導入
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

#### 2. ファイルの配置 (自前ビルドまたはダウンロード)
自前でビルドした生成物 (`output/kmscon`, `output/mod-freetype.so`) を転送するか、または先述のビルド済みバイナリを配置します：

```bash
# 【自前ビルドした場合】PC から転送
scp output/kmscon output/mod-*.so pi@<pomera-ip>:~/kmscon/

# 【共通】Pomera 側でバイナリとモジュールをシステムパスに配置
# 1. 本体バイナリ (/usr/local/bin/)
sudo cp ~/kmscon/kmscon /usr/local/bin/kmscon
sudo chmod +x /usr/local/bin/kmscon

# 2. フォントエンジンモジュール (/usr/local/lib/kmscon/) ※FreeType に必須
sudo mkdir -p /usr/local/lib/kmscon
sudo cp ~/kmscon/mod-*.so /usr/local/lib/kmscon/
```

#### 3. 電源投入時に VT1 で自動起動させる設定 (systemd サービス化)

Pomera の電源を入れた直後から VT1 で kmscon (HackGen フォント) が立ち上がるように、`kmsconvt@.service` を登録します。

```bash
# ユニットファイルの作成
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
ExecStart=/usr/local/bin/kmscon --vt=%I --no-drm --font-name 'HackGen35 Console NF' --font-engine freetype --font-size 18 --term xterm-256color --xkb-model jp106 --xkb-layout jp --no-libseat
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

# getty@tty1 を無効化し、kmsconvt@tty1 を有効化
sudo systemctl daemon-reload
sudo systemctl disable getty@tty1.service
sudo systemctl enable kmsconvt@tty1.service

# サービス起動 (今すぐ動かす場合)
sudo systemctl start kmsconvt@tty1.service
```

これで、電源投入時から VT 切り替え操作なしで、自動的に美しい HackGen35 フォントのコンソールが画面いっぱいに表示されます。

---

### 動作確認 (256色テスト)

ログイン後、以下のコマンドで 256 色のカラーバーを表示して確認できます：

```bash
bash -c 'for i in {0..255}; do printf "\x1b[48;5;%dm%3d\x1b[0m " "$i"; (((i+1)%16==0)) && echo; done'
```

あとは `tmux` や日本語入力 FEP（`uim-fep`）など、好みのコンソール環境をお楽しみください。
