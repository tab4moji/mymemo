## uv

導入と、跡形もなく消す（完全アンインストール）手順だ。
WSLやLinux環境（Ubuntu/Debian）前提で説明する。

### 1. uv の導入
端末で以下のコマンドを順に実行するだけだ。

**インストール**

```bash
sudo apt update && sudo apt install -y pipx && pipx ensurepath && pipx install uv
```

```bash
uv python install 3.12
```

### 2. 使用例

```bash
uv run --with requests,beautifulsoup4 --python 3.12 python ./debian_codes
```

```bash
uv run --with requests,beautifulsoup4 python -c '
import csv, sys, requests, bs4
soup = bs4.BeautifulSoup(requests.get("https://www.debian.org/releases/").text, "html.parser")
rows = [[td.get_text(" ", strip=True) for td in tr.find_all("td")] for tr in soup.find("table").find_all("tr") if tr.find("td")]
w = csv.writer(sys.stdout)
w.writerow(["version", "codename", "release_date", "eol_date", "eol_lts", "eol_elts", "status"])
w.writerows(reversed(rows))
'
```

```python3:debian_codes
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "firebase-admin",
#     "requests",
# ]
# ///
import csv, sys, requests, bs4
soup = bs4.BeautifulSoup(requests.get("https://www.debian.org/releases/").text, "html.parser")
rows = [[td.get_text(" ", strip=True) for td in tr.find_all("td")] for tr in soup.find("table").find_all("tr") if tr.find("td")]
w = csv.writer(sys.stdout)
w.writerow(["version", "codename", "release_date", "eol_date", "eol_lts", "eol_elts", "status"])
w.writerows(reversed(rows))
```

```bash
uv python install 3.14t
```

### 3. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
```bash
uv cache clean && rm -rf "$(uv python dir)" && rm -rf "$(uv tool dir)" && rm -f ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/uvw && rm -f ~/.cargo/bin/uv ~/.cargo/bin/uvx ~/.cargo/bin/uvw
```
