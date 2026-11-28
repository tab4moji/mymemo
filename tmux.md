## tmux で楽したい

### tmux のマウスメニューを便利にしたい

#### .tmux.conf

```config
# 目的と機能: tmux Nerd Font対応およびモダンUI化設定 (Pill/カプセル型・即時決定誤爆防止策)
# 履歴: 19 2026-11-28 コピーモード右クリックメニューを「Copy to host (OSC52)」と「Copy to Windows (clip.exe)」の2択に分割(wt.exeのOSC 52固まり対策)
#       18 2026-11-23 「Paste from Windows」を tmux-winpaste.bash に分離。ssh経由時は ssh_cli.py のクリップボードブリッジから取得
#       17 2026-11-23 ssh先でもコピーできるよう「Copy to Windows」をOSC 52化。「Paste from Windows」はssh経由時に案内表示・末尾改行を付けない。terminal-features/overridesを添字指定にして再読込時の重複と上書き消失を解消
#       16 2026-11-19 OSC 52クリップボード連携(set-clipboard, terminal-features/overrides)を追加
#       15 2026-11-04 Meta+! (M-!) によるウィンドウ生成および不要なデフォルト!の割り当てを解除
#       14 2026-02-22 range機能と MouseDown1Status を用いて session領域のみ左クリックを有効化
################################

set -g prefix C-z

# Meta+! によるウィンドウ立ち上げや誤爆の無効化
unbind-key -n M-!
unbind-key !

# 画像などのエスケープシーケンスを親ターミナルに透過する
# DCS passthrough（エスケープシーケンスの通過）を有効化
set -g allow-passthrough on
set-option -g allow-passthrough on

# 端末情報環境変数を更新対象に追加
set -ga update-environment TERM
set -ga update-environment TERM_PROGRAM

# Windows Terminal等のSixel対応 + OSC 52 クリップボード連携 (親ターミナル/ssh元へのコピー同期)
# -a で追記すると source-file のたびに重複するため、添字を固定して設定する
set -s set-clipboard on
set -s terminal-features[10] '*:sixel:clipboard'

# ウィンドウサイズ計算を接続クライアント最大に同期
setw -g aggressive-resize on
set -g window-size latest

# # ターミナル識別用の環境変数を引き継ぐ
# set -ga update-environment TERM
# set -ga update-environment TERM_PROGRAM

setw -g mode-keys vi # コピーモードのキー操作をvi互換にする
bind -T copy-mode-vi v send -X begin-selection # コピーモードで v を押すと選択開始（Vimの v 挙動）
bind -T copy-mode-vi y send -X copy-selection-and-cancel # ついでに y でヤンク（コピー）も設定しておくと便利
# bind -T copy-mode-vi C-v send -X rectangle-toggle # 矩形選択も C-v でできるようにするならこれ

# プレフィックスキー（モードキー）後に Ctrl+n で下ペインへ移動、Ctrl+p で上ペインへ移動
bind-key -r h select-pane -L
bind-key -r j select-pane -D
bind-key -r k select-pane -U
bind-key -r l select-pane -R

bind % split-window -h -c '#{pane_current_path}'
bind \" split-window -v -c '#{pane_current_path}'

# ==============================================================================
# 🌟 Color Pallet
# ==============================================================================

#set-option -g default-terminal screen-256color
set -s terminal-overrides[0] 'xterm:colors=256'

set -g @status_fg "#11111b" # default
set -g @status_bg "#000000" # default
set -g @tmux_menu "#89b4fa"
set -g @tmux_menu_cmd_a "#f38ba8"
set -g @tmux_menu_cmd_b "#89f3a6"
set -g @window_inactive "#89b4fa"
set -g @window_active_bg "#8bf3a8"
set -g @unselectable_bg "#cecece"
set -g @window_bell_fg "#000000" # 警告用の赤系
set -g @window_bell_bg "#f38ba8" # 警告用の赤系
set -g @window_active_ico " "
set -g @window_inactive_ico " "

# ==============================================================================
# 🌟 Status Bar Appearance (Nerd Font & Pill Shape)
# ==============================================================================
set-option -g status-position bottom
# set -g window-style 'fg=colour240,bg=black'
set -g window-style 'fg=colour240,bg=default'
# set -g window-active-style 'fg=white,bg=black'
set -g window-active-style 'fg=white,bg=default'
set-option -g status-style bg=default,fg=white
set-option -g status-justify left

# ~/.tmux.conf に追記する内容

setw -g window-status-bell-style "fg=#{@status_bg},blink"
set -g bell-action other
set -g visual-bell off

# 左側 (Session & Host & Prefix Indicator)
set -g status-interval 1
set -g @tmux_menu_cmd "#( [ $(( $(date +%%S) %% 2 )) -eq 0 ] && echo '#{@tmux_menu_cmd_a}' || echo '#{@tmux_menu_cmd_b}' )"
set-option -g status-left-length 80 # 最大表示文字数の上限
set -g @status-left-part-menu "#[fg=#{@tmux_menu}]#[bg=default]#[fg=#{@status_fg},bg=#{@tmux_menu}] 󰍜 #S#[fg=#{@tmux_menu}]#[bg=#{@unselectable_bg}]"
set -g @status-left-part-menu-active "#[fg=#{E:@tmux_menu_cmd}]#[bg=default]#[fg=#{@status_fg}]#[bg=#{E:@tmux_menu_cmd}]#[bold]  #S#[fg=#{@status_bg}]#[bg=#{E:@tmux_menu_cmd}]#[bold]#[fg=#{@status_fg}]#[bold] CMD #[fg=#{E:@tmux_menu_cmd}]#[bg=#{@unselectable_bg}]#[nobold]"
set-option -g status-left "#[range=user|session_menu]#{?client_prefix,#{E:@status-left-part-menu-active},#{E:@status-left-part-menu}}#[norange]#[bg=#{@unselectable_bg},fg=#{@status_fg}] #H#[fg=#{@unselectable_bg},bg=default]"

# 右側 (IME + Time) - 独立したカプセル
set-option -g status-right-length 100
set-option -g status-right "#[fg=#{@unselectable_bg},bg=default]#[fg=#{@status_fg},bg=#{@unselectable_bg}]󱛡 %m/%d %H:%M #[fg=#{@unselectable_bg},bg=default]"

# ウィンドウ一覧用
## 隙間（セパレータ）無し
set-window-option -g window-status-separator ""
# ウィンドウ一覧用
## ウィンドウ一覧 (アクティブ)
# set-window-option -g window-status-current-format "#[fg=black,bg=default#{@window_active_bg}  ]#[fg=#{@status_fg},bg=#{@window_active_bg},bold] #{@window_active_ico}#I:#{=/10/󰇘/;b:pane_current_path}:#W#[fg=#{@window_active_bg},bg=#{@status_bg}  ]"
set-window-option -g window-status-current-format "#[fg=#{@window_active_bg},bg=default]#[fg=#{@status_fg},bg=#{@window_active_bg},bold]#{@window_active_ico}#I:#{=/10/󰇘/;b:pane_current_path}:#W#[fg=#{@window_active_bg},bg=default]"
## ウィンドウ一覧 (非アクティブ)
# set-window-option -g window-status-format "#{?window_bell_flag,#[fg=black]#[bg=#{@window_bell_bg}]#[blink]#[fg=#{@window_bell_fg}]#[bg=#{@window_bell_bg}]#[blink] #{@window_inactive_ico}#I:#{=/10/󰇘/;b:pane_current_path}:#W#[fg=#{@window_bell_bg}]#[bg=#{@status_bg}]#[noblink],#[fg=black]#[bg=#{@window_inactive}]#[fg=black]#[bg=#{@window_inactive}]  #I:#{=/10/󰇘/;b:pane_current_path}:#W#[fg=#{@window_inactive}]#[bg=#{@status_bg}]}"
set-window-option -g window-status-format "#{?window_bell_flag,#[fg=black]#[bg=#{@window_bell_bg}]#[blink]#[fg=#{@window_bell_fg}]#[bg=#{@window_bell_bg}]#[blink]#{@window_inactive_ico}#I:#{=/10/󰇘/;b:pane_current_path}:#W#[fg=#{@window_bell_bg}]#[bg=#{@status_bg}]#[noblink],#[fg=#{@window_inactive}]#[bg=default]#[fg=black]#[bg=#{@window_inactive}]  #I:#{=/10/󰇘/;b:pane_current_path}:#W#[fg=#{@window_inactive}]#[bg=default]}"

# ==============================================================================
# 🖱️ Mouse Context Menu with Quick Keys
# ==============================================================================

# マウス有効化
set -g mouse on

# --- 1. 通常時の右クリックメニュー (Root Context) ---
bind-key -n MouseDown3Pane display-menu -x M -y M -T " 󰍽 Context Menu " \
  "󰌑 Enter"                            n  "send-keys Enter" \
  "󰼨 Ctrl-P"                           ^  "send-keys C-p" \
  "󰼧 Ctrl-N"                           v  "send-keys C-n" \
  "󱊷 Escape"                           e  "send-keys Escape" \
  "󰅙 Ctrl-C"                           C  "send-keys C-c" \
  "󰍜 More Keys >"                      k  "display-menu -x M -y M -T \" 󰌌 Soft Keyboard \" \
    \"󰌒 Tab\" t \"send-keys Tab\" \
    \"󰌍 Backspace\" b \"send-keys BSpace\" \
    \"󰆴 Delete\" x \"send-keys DC\" \
    \"\" \
    \"󰁝 Up\" k \"send-keys Up\" \
    \"󰁅 Down\" j \"send-keys Down\" \
    \"󰁍 Left\" h \"send-keys Left\" \
    \"󰁔 Right\" l \"send-keys Right\" \
    \"\" \
    \"󰞂 PageUp\" u \"send-keys PageUp\" \
    \"󰞃 PageDown\" d \"send-keys PageDown\" \
    \"󰜰 Home\" ^ \"send-keys Home\" \
    \"󰜱 End\" $ \"send-keys End\" \
    \"\" \
    \"󰘖 F-Keys...\" f \"display-menu -x M -y M -T \\\" 󰘖 Function Keys \\\" \\\"F1\\\" \\\"\\\" \\\"send-keys F1\\\" \\\"F5\\\" \\\"\\\" \\\"send-keys F5\\\" \\\"F12\\\" \\\"\\\" \\\"send-keys F12\\\"\"" \
  "" \
  "󰅍 Paste [#{=20:buffer_sample}...]" p  paste-buffer \
  "󰖳 Paste from Windows"               P  "run-shell 'bash ~/myworks/rcs/tmux-winpaste.bash #{client_pid} #{pane_id}'" \
  "" \
  "󰚩 Toggle Gemini CLI"                y  "send-keys C-y" \
  "" \
  "󰆏 Copy Mode"                        c  copy-mode \
  "" \
  "󰤻 Split Pane (↑Horz)"                "-" "split-window -vb -c '#{pane_current_path}'" \
  "󰤼 Split Pane (󰁍Vert)"                "|" "split-window -hfb -c '#{pane_current_path}'" \
  "󰤼 Split Pane (Vert󰁔)"                "|" "split-window -hf -c '#{pane_current_path}'" \
  "" \
  "󰗽 Logout Window shell"              d  "send-keys C-d" \

# --- 2. コピーモード（選択中）の右クリックメニュー ---
bind-key -T copy-mode-vi MouseDown3Pane display-menu -x M -y M -T " 󰆏 Copy Mode " \
  "󰆏 Copy"              y  "send-keys -X copy-selection-and-cancel" \
  "󰖳 Copy to host (OSC52)"       Y  "send-keys -X copy-pipe-and-cancel \"tmux load-buffer -w -b osc52 -\"" \
  "󰖳 Copy to Windows (clip.exe)" W  "send-keys -X copy-pipe-and-cancel \"iconv -c -f utf-8 -t utf-16le | /mnt/c/Windows/System32/clip.exe\"" \
  "󰃢 Clear"             c  "send-keys -X clear-selection" \
  "" \
  "󰅙 Cancel"            q  "send-keys -X cancel" \

bind-key -T copy-mode MouseDown3Pane display-menu -x M -y M -T " 󰆏 Copy Mode " \
  "󰆏 Copy"              y  "send-keys -X copy-selection-and-cancel" \
  "󰖳 Copy to host (OSC52)"       Y  "send-keys -X copy-pipe-and-cancel \"tmux load-buffer -w -b osc52 -\"" \
  "󰖳 Copy to Windows (clip.exe)" W  "send-keys -X copy-pipe-and-cancel \"iconv -c -f utf-8 -t utf-16le | /mnt/c/Windows/System32/clip.exe\"" \
  "󰃢 Clear"             c  "send-keys -X clear-selection" \
  "" \
  "󰅙 Cancel"            q  "send-keys -X cancel" \

# --- 3. ドラッグ終了時の自動コピー無効化 ---
unbind-key -T copy-mode-vi MouseDragEnd1Pane
unbind-key -T copy-mode    MouseDragEnd1Pane

# --- 4. ステータスバーの右クリックメニュー (完全廃止) ---
unbind-key -n MouseDown3Status

# --- 5. ステータスバー左端 (Session Name領域) の左クリックメニュー ---
# ホスト名など、range外の左端をクリックした場合は何もしない
unbind-key -n MouseDown1StatusLeft

# range部分(session_menu)またはウィンドウタブをクリックした場合の処理
# 条件: クリックされた範囲が 'session_menu' ならメニューを展開。それ以外(ウィンドウなど)なら標準のタブ切り替えを行う
bind-key -n MouseDown1Status if -F '#{==:#{mouse_status_range},session_menu}' \
  'display-menu -T "#[align=centre] #{session_name} " -t = -x M -y W \
    " New Window"     w new-window \
    "" \
    "󰗽 Detach TMUX"    d detach-client' \
  'select-window -t ='
```

```bash:tmux-winpaste.bash
#!/bin/bash
# 目的: tmuxの「Paste from Windows」本体。操作しているクライアントの手元Windowsクリップボードを貼り付ける
#       - ssh経由: ssh_cli.py のクリップボードブリッジ(@clip_sock のUnixソケット)から取得
#       - ローカル(WSL): このホストの powershell.exe で Get-Clipboard
# 使い方: tmux-winpaste.bash <client_pid> <pane_id>   (.tmux.conf の run-shell から呼ぶ)
# 履歴: 1 2026-11-23 初版

set -o pipefail

client_pid="$1"
pane_id="$2"
buf="win_tmp"
ps_exe="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

fail() {
    tmux display-message "Paste from Windows: $1"
    exit 1
}

# クライアントがssh経由かどうか(tmuxクライアントプロセスの環境変数で判定)
is_ssh=0
if [ -n "$client_pid" ] && grep -qz '^SSH_CONNECTION=' "/proc/$client_pid/environ" 2>/dev/null; then
    is_ssh=1
fi

if [ "$is_ssh" = 1 ]; then
    sock="$(tmux show-options -sv @clip_sock 2>/dev/null)"
    [ -n "$sock" ] || fail "クリップボードブリッジ未設定(ssh_cli.py で接続していない?)"
    [ -S "$sock" ] || fail "ブリッジのソケットが無い: $sock"
    curl -sSf --max-time 15 --unix-socket "$sock" http://clip/clip | tmux load-buffer -b "$buf" - \
        || fail "ブリッジから取得できない(切断済み?): $sock"
else
    [ -x "$ps_exe" ] || fail "powershell.exe が無い(WSLではない?)"
    "$ps_exe" -NoProfile -Command \
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Out.Write((Get-Clipboard -Raw))' \
        | tr -d '\r' | tmux load-buffer -b "$buf" - \
        || fail "Get-Clipboard に失敗"
fi

tmux paste-buffer -p -d -b "$buf" ${pane_id:+-t "$pane_id"}
```

##### Windows Terminal 側の設定

[./windowsterminal_settings.png](./windowsterminal_settings.png)

#### 有名フォント
Hack と源柔ゴシックを合成したプログラミングフォント 白源 (はくげん／HackGen) https://github.com/yuru7/HackGen/releases Nerd Fonts 合成版: HackGen_NF_v2.10.0.zip

##
