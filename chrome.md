## WSLを快適にしたい

### pwsh

```bash: powershell.exe / pwsh
alias powershell.exe='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
alias pwsh.exe='$(wslpath -u "$(powershell.exe -NoProfile –ExecutionPolicy Bypass -NonInteractive "where.exe pwsh" | sed -E "/^$/d" | iconv -t utf-8 | tail -1)")'
```

```bash
win_home="$(wslpath -u pwsh -NoProfile -Command "\$env:USERPROFILE")")"; "${win_home%%$'\r'}/AppData/Local/Microsoft/WindowsApps/winget.exe" install usbipd-win
```

```powershell
taskkill /F /IM chrome.exe /T; & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="C:\Users\pi\remote_chrome\"; netsh interface portproxy add v4tov6 listenport=9222 listenaddress=0.0.0.0 connectaddress=::1 connectport=9222; netsh interface portproxy show v4tov6
```
