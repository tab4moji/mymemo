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
