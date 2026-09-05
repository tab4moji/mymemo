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
# 生成物は ./output/ 以下に kmscon 本体と各フォントモジュール(.so)。
#
set -euo pipefail

WORKDIR="$(pwd)/kmscon-build"
OUTDIR="$(pwd)/output"
IMAGE_TAG="kmscon-armhf-builder:bullseye"
KMSCON_TAG="v10.0.2"
POMERA_HOST="pomera@192.168.0.21"

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
[ -f build/src/font/mod-unifont.so ] && cp build/src/font/mod-unifont.so /out/
[ -f build/src/font/mod-freetype2.so ] && cp build/src/font/mod-freetype2.so /out/
[ -f build/src/font/mod-freetype.so ] && cp build/src/font/mod-freetype.so /out/

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
echo "    scp ${OUTDIR}/kmscon ${OUTDIR}/mod-*.so ${POMERA_HOST}:/tmp/"

