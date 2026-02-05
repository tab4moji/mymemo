## tmux で楽したい

### tmux のマウスメニューを便利にしたい

```conf
# tmux source-file ~/.tmux.conf
################################

set -g prefix C-z

setw -g mode-keys vi # コピーモードのキー操作をvi互換にする
bind -T copy-mode-vi v send -X begin-selection # コピーモードで v を押すと選択開始（Vimの v 挙動）
bind -T copy-mode-vi y send -X copy-selection-and-cancel # ついでに y でヤンク（コピー）も設定しておくと便利
bind -T copy-mode-vi C-v send -X rectangle-toggle # 矩形選択も C-v でできるようにするならこれ

#set-option -g default-terminal screen-256color
set-option -g terminal-overrides 'xterm:colors=256'

# ==============================================================================
# Mouse Context Menu with Quick Keys
# ==============================================================================

# マウス有効化
set -g mouse on

# --- 1. 通常時の右クリックメニュー (Root Context) ---
# ESC, Enter, Ctrl-C を最上部に配置
# その下に矢印キーなどを格納したサブメニュー "More Keys >" を配置
bind-key -n MouseDown3Pane display-menu -x M -y M -T "Context Menu" \
  "[Enter]✅"                          n  "send-keys Enter" \
  "Ctrl-P..◀"                          ^  "send-keys C-p" \
  "Ctrl-N..▶"                          v  "send-keys C-n" \
  "[Escape]❎"                            e  "send-keys Escape" \
  "Ctrl-C..❗"                         C  "send-keys C-c" \
  "More Keys >"                        k  "display-menu -x M -y M -T \"Soft Keyboard\" \
    \"Tab\" t \"send-keys Tab\" \
    \"Backspace\" b \"send-keys BSpace\" \
    \"Delete\" x \"send-keys DC\" \
    \"\" \
    \"Up\" k \"send-keys Up\" \
    \"Down\" j \"send-keys Down\" \
    \"Left\" h \"send-keys Left\" \
    \"Right\" l \"send-keys Right\" \
    \"\" \
    \"PageUp\" u \"send-keys PageUp\" \
    \"PageDown\" d \"send-keys PageDown\" \
    \"Home\" ^ \"send-keys Home\" \
    \"End\" $ \"send-keys End\" \
    \"\" \
    \"F-Keys...\" f \"display-menu -x M -y M -T \\\"Function Keys\\\" \\\"F1\\\" \\\"\\\" \\\"send-keys F1\\\" \\\"F5\\\" \\\"\\\" \\\"send-keys F5\\\" \\\"F12\\\" \\\"\\\" \\\"send-keys F12\\\"\"" \
  "" \
  "Paste [#{=20:buffer_sample}...]"    p  paste-buffer \
  "Paste from Win"                     P  "run-shell '\"/mnt/c/Program Files/PowerShell/7/pwsh.exe\" -c \"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard\" | tr -d \"\r\" | tmux load-buffer -b win_tmp - ; tmux paste-buffer -p -d -b win_tmp'" \
  "" \
  "Copy Mode"                          c  copy-mode \
  "Close"                              q  ""


# --- 2. コピーモード（選択中）の右クリックメニュー ---

bind-key -T copy-mode-vi MouseDown3Pane display-menu -x M -y M -T "Copy Mode Menu" \
  "Copy"        y  "send-keys -X copy-selection-and-cancel" \
  "Copy to Win" Y  "send-keys -X copy-pipe-and-cancel \"base64 -w0 | \\\"/mnt/c/Program Files/PowerShell/7/pwsh.exe\\\" -NoProfile -command ' \\\$in = \\\$Input | Out-String; \\\$txt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\\\$in)); Set-Clipboard -Value \\\$txt '\"" \
  "Clear"       c  "send-keys -X clear-selection" \
  "" \
  "Cancel"      q  "send-keys -X cancel"

bind-key -T copy-mode MouseDown3Pane display-menu -x M -y M -T "Copy Mode Menu" \
  "Copy"        y  "send-keys -X copy-selection-and-cancel" \
  "Copy to Win" Y  "send-keys -X copy-pipe-and-cancel \"base64 -w0 | \\\"/mnt/c/Program Files/PowerShell/7/pwsh.exe\\\" -NoProfile -command ' \\\$in = \\\$Input | Out-String; \\\$txt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\\\$in)); Set-Clipboard -Value \\\$txt '\"" \
  "Clear"       c  "send-keys -X clear-selection" \
  "" \
  "Cancel"      q  "send-keys -X cancel"

# --- 3. ドラッグ終了時の自動コピー無効化 ---
unbind-key -T copy-mode-vi MouseDragEnd1Pane
unbind-key -T copy-mode    MouseDragEnd1Pane
```
