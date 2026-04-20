#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import time
import curses
import psutil
import subprocess
import json
import threading
from collections import deque

# 定数設定
CACHE_UPDATE_INTERVAL = 2.0    # ホスト側情報更新間隔（秒）
UPDATE_INTERVAL = 1.0          # 画面描画更新間隔（秒）
KEY_SLEEP = 0.005              # キー入力スレッドの待機時間（秒）
SMA_WINDOW = 5                 # SMA用サンプル数

# 終了用イベント
exit_event = threading.Event()

# グローバルキャッシュ（ホスト側情報）
host_cpu_cache = None    # (overall, per_core, err)
host_proc_cache = None   # (host_proc_results, err)

# ホスト側プロセス差分用のグローバル辞書
host_prev_times = {}
host_usage_history = {}

###############################################################################
# ユーティリティ関数群
###############################################################################

def draw_progress_bar(usage, bar_length):
    """ 0～100 の CPU 使用率から、filled '#' と empty '.' のバー文字列を返す """
    filled = int(round(usage / 100 * bar_length))
    empty = bar_length - filled
    return "#" * filled + "." * empty

def get_host_cpu_info():
    ps_path = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    cmd = (ps_path +
           ' -NoProfile -Command "Get-Counter \'\\Processor(*)\\% Processor Time\' | ConvertTo-Json"')
    try:
        output = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        data = json.loads(output.decode("utf-8", errors="replace"))
        samples = []
        if isinstance(data, list):
            for item in data:
                if "CounterSamples" in item:
                    samples.extend(item["CounterSamples"])
                else:
                    samples.append(item)
        elif isinstance(data, dict):
            samples = data.get("CounterSamples", [])
        else:
            samples = []
        overall = None
        per_core = []
        for sample in samples:
            inst = sample.get("InstanceName", "")
            val = sample.get("CookedValue")
            if inst.lower() == "_total":
                overall = val
            else:
                per_core.append((inst, val))
        return overall, per_core, None
    except Exception as e:
        return None, None, str(e)

def get_host_processes():
    ps_path = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    cmd = (ps_path +
           ' -NoProfile -Command "Get-Process | Select-Object Id,ProcessName,CPU | ConvertTo-Json -Compress"')
    try:
        output = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        data = json.loads(output.decode("utf-8", errors="replace"))
        if isinstance(data, dict):
            proc_list = [data]
        else:
            proc_list = data
        for proc in proc_list:
            try:
                proc["CPU"] = float(proc.get("CPU", 0) or 0)
            except Exception:
                proc["CPU"] = 0.0
        return proc_list, None
    except Exception as e:
        return None, str(e)

###############################################################################
# バックグラウンドスレッド：ホスト側情報更新専用
###############################################################################

def host_info_updater():
    global host_cpu_cache, host_proc_cache, host_prev_times, host_usage_history
    while not exit_event.is_set():
        # ホスト側 CPU 情報更新
        new_cpu = get_host_cpu_info()  # (overall, per_core, err)
        # プロセス情報更新と差分計算
        new_proc, proc_err = get_host_processes()
        proc_results = []
        if new_proc:
            for proc in new_proc:
                proc_id = proc["Id"]
                cpu_time = proc.get("CPU", 0.0)
                if proc_id in host_prev_times:
                    diff = cpu_time - host_prev_times[proc_id]
                    # 差分を CACHE_UPDATE_INTERVAL で割って%換算
                    inst_usage = max(diff, 0) / CACHE_UPDATE_INTERVAL * 100
                    if proc_id in host_usage_history:
                        host_usage_history[proc_id].append(inst_usage)
                    else:
                        host_usage_history[proc_id] = deque([inst_usage], maxlen=SMA_WINDOW)
                else:
                    host_usage_history[proc_id] = deque([0], maxlen=SMA_WINDOW)
                host_prev_times[proc_id] = cpu_time
                sma = sum(host_usage_history[proc_id]) / len(host_usage_history[proc_id])
                proc_results.append((proc_id, proc.get("ProcessName", "N/A"), sma))
            proc_results.sort(key=lambda x: x[2], reverse=True)
            host_proc_cache = (proc_results[:10], None)
        else:
            host_proc_cache = (None, proc_err or "No host process data")
        host_cpu_cache = new_cpu
        time.sleep(CACHE_UPDATE_INTERVAL)

###############################################################################
# メインループ（描画とキー入力を同一スレッドで行う）
###############################################################################

def main_loop(stdscr):
    # curses 初期化
    curses.curs_set(0)
    stdscr.nodelay(True)
    # キー入力専用スレッド用ロック（全ての curses 呼び出しはこのロックを使って排他制御）
    curses_lock = threading.Lock()

    # キー入力専用スレッド
    def input_thread():
        while not exit_event.is_set():
            with curses_lock:
                ch = stdscr.getch()
            if ch == ord('q'):
                exit_event.set()
                break
            time.sleep(KEY_SLEEP)
    input_thr = threading.Thread(target=input_thread, daemon=True)
    input_thr.start()

    last_update = time.monotonic()
    while not exit_event.is_set():
        if time.monotonic() - last_update >= UPDATE_INTERVAL:
            last_update = time.monotonic()
            with curses_lock:
                stdscr.erase()
                line = 0
                now_str = time.strftime("%H:%M:%S")
                stdscr.addstr(line, 0, f"CPU Monitor - Time: {now_str}")
                line += 1
                stdscr.addstr(line, 0, "-" * 70)
                line += 1

                # Windows Host 情報（グローバルキャッシュ使用）
                stdscr.addstr(line, 0, "Windows Host Overall CPU (_Total):")
                line += 1
                local_host_cpu = host_cpu_cache
                if local_host_cpu:
                    host_overall, host_per_core, err = local_host_cpu
                else:
                    host_overall, host_per_core, err = (None, None, "No data yet")
                if err:
                    stdscr.addstr(line, 0, f"Error: {err}")
                    line += 2
                else:
                    if host_overall is not None:
                        stdscr.addstr(line, 0, f"{host_overall:6.2f}%  [{draw_progress_bar(host_overall, 40)}]")
                        line += 2
                        stdscr.addstr(line, 0, "Windows Host Per-Core CPU:")
                        line += 1
                        stdscr.addstr(line, 0, f"_Total: {host_overall:6.2f}%  [{draw_progress_bar(host_overall, 30)}]")
                        line += 1
                        if host_per_core:
                            for inst, usage in host_per_core:
                                stdscr.addstr(line, 0, f"Core {inst}: {usage:6.2f}%  [{draw_progress_bar(usage, 30)}]")
                                line += 1
                        else:
                            stdscr.addstr(line, 0, "No per-core data.")
                            line += 1
                    else:
                        stdscr.addstr(line, 0, "No host CPU data available.")
                        line += 2

                stdscr.addstr(line, 0, "Windows Host Top 10 Processes (5-sec SMA):")
                line += 1
                local_host_proc = host_proc_cache
                if local_host_proc:
                    proc_results, proc_err = local_host_proc
                    if proc_err:
                        stdscr.addstr(line, 0, f"Error: {proc_err}")
                        line += 1
                    elif proc_results:
                        for pid, name, usage in proc_results:
                            stdscr.addstr(line, 0, f"PID: {pid:<6}  Name: {name:<20}  CPU: {usage:6.2f}%")
                            line += 1
                    else:
                        stdscr.addstr(line, 0, "No process data yet.")
                        line += 1
                else:
                    stdscr.addstr(line, 0, "Loading host process data...")
                    line += 1

                line += 1  # 空行

                # WSL2 情報（psutil によるリアルタイム取得）
                stdscr.addstr(line, 0, "WSL2 Overall CPU (_Total):")
                line += 1
                overall_local = psutil.cpu_percent(interval=None)
                stdscr.addstr(line, 0, f"{overall_local:6.2f}%  [{draw_progress_bar(overall_local, 40)}]")
                line += 2
                stdscr.addstr(line, 0, "WSL2 Per-Core CPU:")
                line += 1
                stdscr.addstr(line, 0, f"_Total: {overall_local:6.2f}%  [{draw_progress_bar(overall_local, 30)}]")
                line += 1
                per_core_local = psutil.cpu_percent(percpu=True, interval=None)
                for i, core in enumerate(per_core_local):
                    stdscr.addstr(line, 0, f"Core {i}: {core:6.2f}%  [{draw_progress_bar(core, 30)}]")
                    line += 1

                stdscr.addstr(line+1, 0, "Press 'q' to quit.")
                stdscr.refresh()
        time.sleep(0.005)

###############################################################################
# メインエントリーポイント
###############################################################################

if __name__ == "__main__":
    # バックグラウンド情報更新スレッド開始
    updater_thread = threading.Thread(target=host_info_updater, daemon=True)
    updater_thread.start()
    # キー入力は専用スレッドで処理し、描画はメインループで実行
    curses.wrapper(main_loop)

