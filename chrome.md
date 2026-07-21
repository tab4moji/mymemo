## Chrome を操りたい

### pwsh

```bash: powershell.exe / pwsh
alias powershell.exe='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
alias pwsh.exe="$(wslpath -u "$(powershell.exe -NoProfile –ExecutionPolicy Bypass -NonInteractive "where.exe pwsh" | iconv -t utf-8 | sed -E 's/\r//g' | tail -1)")"
alias pwsh='_() {
        chcp_com () {
            /mnt/c/Windows/System32/chcp.com "$@" 2>/dev/null
        }

        local_pwsh() {
            local ps1_filename_upath="$1"
            local ps1_filename_upath="$(wslpath -u "${ps1_filename_upath}" 2>/dev/null || echo "${ps1_filename_upath}")"

            if [[ -f "${ps1_filename_upath}" ]]
            then

                shift
                pwsh.exe -NoProfile -NonInteractive –ExecutionPolicy Bypass -Command "$(wslpath -w ${ps1_filename_upath}) "$@"" | sed -E "s/\r//g"
                local exit_status=$?

            elif [[ "$@" != "" ]]
            then

                pwsh.exe -NoProfile -NonInteractive –ExecutionPolicy Bypass -Command "$@" | sed -E "s/\r//g"
                local exit_status=$?

            else

                pwsh.exe -ExecutionPolicy Bypass -NoExit -Command "cd ~/"
                local exit_status=$?
            fi

            return ${exit_status}
        }
        local_pwsh "$@"
    };
    _'
```

```bash
pwsh 'taskkill /F /IM chrome.exe /T; & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="C:\Users\pi\remote_chrome\"; netsh interface portproxy add v4tov6 listenport=9222 listenaddress=0.0.0.0 connectaddress=::1 connectport=9222; netsh interface portproxy show v4tov6'
```

### pwsh

```python
"""
目的: リモートデバッグモードで起動したChromeにSeleniumで接続し、指定したURLを開いてタイトルを取得する。
進行状況が詳細にわかるようにログ出力を行う。
更新履歴:
01 - 2026-07-20 - 新規作成
02 - 2026-07-21 - Selenium Managerによるドライババージョン不整合を防ぐため、バージョン150を明示的に指定
03 - 2026-07-21 - loggingモジュールを用いて処理経過の詳細なログ出力を追加
"""

import sys
import argparse
import logging
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import WebDriverException

class InfoFilter(logging.Filter):
    """
    WARNING未満のログ（INFO, DEBUGなど）のみを許可するフィルタ。
    """
    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno < logging.WARNING

def setup_logger(debug_mode: bool) -> logging.Logger:
    """
    標準出力（通常ログ）と標準エラー出力（エラーログ）を分けたロガーを構築する。
    """
    logger = logging.getLogger(__name__)
    level = logging.DEBUG if debug_mode else logging.INFO
    logger.setLevel(level)

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

    # 標準出力用ハンドラ（WARNING未満用）
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(level)
    stdout_handler.setFormatter(formatter)
    stdout_handler.addFilter(InfoFilter())
    logger.addHandler(stdout_handler)

    # 標準エラー用ハンドラ（WARNING以上用）
    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setLevel(logging.WARNING)
    stderr_handler.setFormatter(formatter)
    logger.addHandler(stderr_handler)

    return logger

def connect_to_chrome(debugger_address: str, target_url: str, logger: logging.Logger) -> bool:
    """
    指定されたデバッグアドレスのChromeに接続し、詳細なログを出力しながらURLを開く。
    """
    success = False
    options = Options()
    options.add_experimental_option("debuggerAddress", debugger_address)
    options.browser_version = "150"

    logger.info(f"Chrome({debugger_address})への接続を開始する...")

    try:
        driver = webdriver.Chrome(options=options)
        logger.info("Chromeへのアタッチに成功した。")
        
        logger.info(f"ターゲットURLへ遷移要求を送信: {target_url}")
        driver.get(target_url)
        
        logger.info("ページのロード処理が完了した。")
        logger.info(f"現在のアクティブURL: {driver.current_url}")
        logger.info(f"取得したページタイトル: {driver.title}")
        
        success = True
    except WebDriverException as e:
        logger.error(f"Chromeへの接続または操作に失敗した: {e}")
    except Exception as e:
        logger.error(f"予期せぬエラーが発生した: {e}")

    return success

def main() -> None:
    parser = argparse.ArgumentParser(description="リモートデバッグモードのChromeを詳細ログ付きで操作する")
    parser.add_argument(
        "--address",
        type=str,
        default="localhost:9222",
        help="Chromeのデバッグアドレス (例: 192.168.0.11:9222)"
    )
    parser.add_argument(
        "--url",
        type=str,
        default="https://www.google.com",
        help="操作対象のChromeで開くURL"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="デバッグレベルのより詳細なログを出力する"
    )
    args = parser.parse_args()

    logger = setup_logger(args.debug)
    result = connect_to_chrome(args.address, args.url, logger)
    
    if not result:
        sys.exit(1)

if __name__ == '__main__':
    main()
```
