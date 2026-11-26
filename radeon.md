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

### デバイスドライバリセット

```powershell:デバイスドライバリセット
pnputil /disable-device "PCI\VEN_1002&DEV_7590&SUBSYS_00311F66&REV_C0\6&EDE801E&0&00000009"
pnputil /enable-device "PCI\VEN_1002&DEV_7590&SUBSYS_00311F66&REV_C0\6&EDE801E&0&00000009"
```

#### AMD Adrenarin 再起動

```powershell
start "C:\Program Files\AMD\CNext\CNext\RadeonSoftware.exe"
```

### GPU チェック

#### チェック用コマンド

```powershell:チェック用コマンド
$env:HSA_OVERRIDE_GFX_VERSION = "11.5.0"; $env:HIP_VISIBLE_DEVICES = "0,1"; $env:ROCR_VISIBLE_DEVICES = "0,1"; uv run --index-url https://rocm.nightlies.amd.com/whl-multi-arch/ --with "torch[device-all]" --with numpy python -c "import torch; print('=== ROCm Multi-GPU Check ==='); print('Available :', torch.cuda.is_available()); [print(f'Device [{i}]: {torch.cuda.get_device_name(i)} | VRAM: {round(torch.cuda.get_device_properties(i).total_memory / 1e9, 2)} GB') for i in range(torch.cuda.device_count())]"
```

#### 動作結果

```powershell:動作結果
PS C:\> $env:HSA_OVERRIDE_GFX_VERSION = "11.5.0"; $env:HIP_VISIBLE_DEVICES = "0,1"; $env:ROCR_VISIBLE_DEVICES = "0,1"; uv run --index-url https://rocm.nightlies.amd.com/whl-multi-arch/ --with "torch[device-all]" --with numpy python -c "import torch; print('=== ROCm Multi-GPU Check ==='); print('Available :', torch.cuda.is_available()); [print(f'Device [{i}]: {torch.cuda.get_device_name(i)} | VRAM: {round(torch.cuda.get_device_properties(i).total_memory / 1e9, 2)} GB') for i in range(torch.cuda.device_count())]"
=== ROCm Multi-GPU Check ===
Available : True
Device [0]: AMD Radeon(TM) Graphics | VRAM: 13.12 GB
Device [1]: AMD Radeon RX 9060 XT | VRAM: 17.1 GB
PS C:\>
```

### wsl

新しい WSL2（Ubuntu 24.04 等）環境から **2 回の貼り付け**で dGPU（RX 9060 XT）の表示と演算確認まで到達できるようにまとめました。Windows 側には AMD Software: Adrenalin Edition 26.2.2 以降が入っている前提です。

### 1 回目の貼り付け：ROCm・librocdxg・uv のセットアップ

競合する Ubuntu 標準 HSA パッケージの削除、ROCm と `librocdxg` の導入、`uv` のインストール、および環境変数の永続化をまとめて行います。

```bash
set -e

# 1. 競合する Ubuntu 標準 HSA パッケージを削除
sudo apt remove --purge -y libhsa-runtime64-1 libhsakmt1 2>/dev/null || true

# 2. ROCm 7.2.4 が未導入の場合はインストール（導入済みならスキップ）
if [ ! -d /opt/rocm-7.2.4 ]; then
  sudo apt update && sudo apt install -y wget curl gnupg2
  wget -qO - https://repo.radeon.com/rocm/rocm.gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/rocm.gpg > /dev/null
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/rocm.gpg] https://repo.radeon.com/rocm/apt/7.2.4 noble main" | sudo tee /etc/apt/sources.list.d/rocm.list
  printf 'Package: *\nPin: release o=repo.radeon.com\nPin-Priority: 600\n' | sudo tee /etc/apt/preferences.d/rocm-pin-600
  sudo apt update && sudo apt install -y rocm-hip-runtime rocminfo
fi

# 3. librocdxg の最新ビルド済み .deb を取得してインストール
ROCDXG_URL=$(curl -s https://api.github.com/repos/ROCm/librocdxg/releases/latest \
  | grep -oE 'https://[^"]+rocdxg-roct_[^"]+_amd64\.deb' | head -n 1)
wget -qO /tmp/rocdxg.deb "$ROCDXG_URL"
sudo dpkg -i /tmp/rocdxg.deb
rm -f /tmp/rocdxg.deb
sudo ldconfig

# 4. uv が未導入の場合はインストール
command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh

# 5. 環境変数を ~/.bashrc に追記
grep -q 'HSA_ENABLE_DXG_DETECTION' ~/.bashrc || cat << 'EOF' >> ~/.bashrc
export HSA_ENABLE_DXG_DETECTION=1
export LD_LIBRARY_PATH="/opt/rocm-7.2.4/lib:/opt/rocm/lib:${LD_LIBRARY_PATH}"
export PATH="$HOME/.local/bin:$PATH"
EOF

source ~/.bashrc
echo "=== Setup Complete ==="
```

### 2 回目の貼り付け：dGPU 名の表示と演算チェック

`rocminfo` での認識確認に続けて、ROCm 7.2 系 PyTorch で dGPU 名・VRAM 容量の表示と行列積テストを実行します。

```bash
export HSA_ENABLE_DXG_DETECTION=1
export LD_LIBRARY_PATH="/opt/rocm-7.2.4/lib:/opt/rocm/lib:${LD_LIBRARY_PATH}"
export PATH="$HOME/.local/bin:$PATH"

/opt/rocm-7.2.4/bin/rocminfo | grep -E "Agent |Name:|Marketing Name:"

uv run --python 3.12 \
  --find-links https://repo.radeon.com/rocm/manylinux/rocm-rel-7.2/ \
  --with "torch==2.10.0+rocm7.2.0.lw.gitb6ee5fde" --with numpy \
  python -c "import torch; print('=== ROCm WSL Check ==='); print('Available :', torch.cuda.is_available()); [print(f'Device [{i}]: {torch.cuda.get_device_name(i)} | VRAM: {round(torch.cuda.get_device_properties(i).total_memory / 1e9, 2)} GB') for i in range(torch.cuda.device_count())]; a = torch.randn(1024, 1024, device='cuda'); b = a @ a; torch.cuda.synchronize(); print('Matmul OK :', b.shape)"
```

これで `Device [0]: AMD Radeon RX 9060 XT | VRAM: 17.04 GB` と `Matmul OK : torch.Size([1024, 1024])` まで一気に出力されます。
