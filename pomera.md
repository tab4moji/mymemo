## Pomera DM200/DM250

### Pomera 用の linux 環境

[Debian on Pomera DM200/DM250](https://www.ekesete.net/log/?p=9504)

### kmscon

#### 使いたい有名フォント

Hack と源柔ゴシックを合成したプログラミングフォント 白源 (はくげん／HackGen)
[https://github.com/yuru7/HackGen/releases](https://github.com/yuru7/HackGen/releases)
**Nerd Fonts 合成版**: HackGen_NF_v2.10.0.zip

fbterm だとフォントがズレて表示されていたいので [kmscon/kmscon](https://github.com/kmscon/kmscon) をクロスビルドして使う。
無保証バイナリで良ければ [ここ](./kmscon) を使えるが、dm200 でしか試していない。

VT2 で起動する。
が、今のところ Ctrl+Alt+F3 => Ctrl+Alt+F2 してから使っている。その他一度でも別の VT に移動すると、kmscon が VT2 をつかめなくなるので VT1 で kmscon を再起動しないとダメ。

```bash
sudo kmscon --vt=2 --no-libseat --term xterm --xkb-model jp106 --xkb-layout jp --font-engine freetype --font-name "HackGen35 Console NF" --debug -v --front-size 18
```

#### Pomera 用に*パッチ*とクロスビルド

画面のドライバの情報通知内容にバグがありそうなので kmscon を pomera 専用化するパッチ。

- パッチは要するにこれ。

```patch
diff --git a/src/video/fbdev_video.c b/src/video/fbdev_video.c
index a30250a..6223fe2 100644
--- a/src/video/fbdev_video.c
+++ b/src/video/fbdev_video.c
@@ -131,7 +131,7 @@ static int refresh_info(struct display *disp)

 static int display_activate_force(struct display *disp, bool force)
 {
-       static const char depths[] = {32, 24, 16, 0};
+       static const char depths[] = {16, 0};
        struct fbdev_display *dfb = disp->data;
        struct fb_var_screeninfo *vinfo;
        struct fb_fix_screeninfo *finfo;
```

これがビルドの時のシェルスクリプト。
*注意：勝手に apt パッケージをインストールするので環境を汚す*

```bash:build_kmscon_armhf.sh
#!/usr/bin/env bash
#
# DM200 (Debian 11 bullseye, armhf, glibc 2.31) 向けに
# kmscon v10.0.2 を Docker (Debian bullseye + armhf クロスツールチェーン) で
# クロスビルドするスクリプト。WSL2 / Linux 上の Docker で実行する。
#
# 今回のバージョン:
#   - depths[] パッチ (32bpp誤動作対策、既存の修正を維持)
#   - font_freetype を有効化 (HackGen等のTTFフォントを使うため)
#   - font_unifont も維持 (フォールバック用)
#
# 使い方:
#   chmod +x build_kmscon_armhf.sh
#   ./build_kmscon_armhf.sh
#
# 生成物は ./output/ 以下に kmscon 本体。
#
set -euo pipefail

WORKDIR="$(pwd)/kmscon-build"
OUTDIR="$(pwd)/output"
IMAGE_TAG="kmscon-armhf-builder:bullseye"
KMSCON_TAG="v10.0.2"
POMERA_HOST="pomera@ポメラホストのIPadd"

mkdir -p "${WORKDIR}" "${OUTDIR}"

# -----------------------------------------------------------------------------
# 1. Dockerfile: freetype2 / fontconfig の armhf 開発パッケージを追加
# -----------------------------------------------------------------------------
cat > "${WORKDIR}/Dockerfile" <<'EOF'
FROM debian:bullseye

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg --add-architecture armhf && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        crossbuild-essential-armhf \
        pkg-config \
        ninja-build \
        python3 \
        python3-pip \
        git \
        ca-certificates \
        wget \
        file \
        zlib1g-dev \
        libxkbcommon-dev:armhf \
        libudev-dev:armhf \
        libdrm-dev:armhf \
        zlib1g-dev:armhf \
        libfreetype6-dev:armhf \
        libfontconfig1-dev:armhf \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir "meson>=1.1"

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

# DM200 (16bpp RGB565専用パネル) 向けパッチ: 32bppへの自動モード変更を防ぐ
if grep -q 'static const char depths\[\] = {32, 24, 16, 0};' src/video/fbdev_video.c; then
    sed -i 's/static const char depths\[\] = {32, 24, 16, 0};/static const char depths[] = {16, 0};/' \\
        src/video/fbdev_video.c
    echo "==> fbdev_video.c の depths[] を {16, 0} にパッチしました"
fi

rm -rf build

#     -Dfont_pango=disabled \\


meson setup build \\
    --cross-file /work/armhf-cross.txt \\
    --buildtype=release \\
    -Dvideo_fbdev=enabled \\
    -Dvideo_drm2d=disabled \\
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

file "\${KMSCON_BIN}"

mkdir -p /out
cp "\${KMSCON_BIN}" /out/kmscon
# [ -f build/src/font/mod-unifont.so ] && cp build/src/font/mod-unifont.so /out/
# [ -f build/src/font/mod-freetype2.so ] && cp build/src/font/mod-freetype2.so /out/
# [ -f build/src/font/mod-freetype.so ] && cp build/src/font/mod-freetype.so /out/

echo "---- /out の内容 ----"
ls -la /out
echo "---- 依存ライブラリ ----"
arm-linux-gnueabihf-readelf -d "\${KMSCON_BIN}" | grep NEEDED
EOF
chmod +x "${WORKDIR}/do_build.sh"

# -----------------------------------------------------------------------------
# 4. イメージビルド & コンテナ実行
# -----------------------------------------------------------------------------
echo "==> Dockerイメージをビルドします (${IMAGE_TAG})"
docker build -t "${IMAGE_TAG}" "${WORKDIR}"

echo "==> コンテナ内で kmscon ${KMSCON_TAG} (freetype対応版) をクロスビルドします"
docker run --rm \
    -v "${WORKDIR}:/work" \
    -v "${OUTDIR}:/out" \
    "${IMAGE_TAG}" \
    /work/do_build.sh

echo "==> 完了。転送コマンド例:"
echo "    scp ${OUTDIR}/kmscon ${POMERA_HOST}:/tmp/"
```

あとは、uim-fep とか tmux とかご自由に。
