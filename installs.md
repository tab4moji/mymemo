## uv

Rustで書かれた、非常に高速な [python](./?content=python) パッケージおよびプロジェクトマネージャー。

### 1. uv の導入

端末で以下のコマンドを順に実行するだけだ。

**インストール**

```bash
sudo apt update && sudo apt install -y pipx && pipx ensurepath && pipx install uv
```

```bash
uv python install 3.12
```

### 2. uv で python コード実行

#### ワンライナー的呼び出し

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

#### python コードのファイル名を指定して uv コマンドで

```bash
uv run --with requests,beautifulsoup4 --python 3.12 python ./debian_codes
```

#### python コードの先頭に shebang 埋め込んで python コードの ファイル名で実行

```python:debian_codes
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "requests",
#     "beautifulsoup4",
# ]
# ///
import csv, sys, requests, bs4
soup = bs4.BeautifulSoup(requests.get("https://www.debian.org/releases/").text, "html.parser")
rows = [[td.get_text(" ", strip=True) for td in tr.find_all("td")] for tr in soup.find("table").find_all("tr") if tr.find("td")]
w = csv.writer(sys.stdout)
w.writerow(["version", "codename", "release_date", "eol_date", "eol_lts", "eol_elts", "status"])
w.writerows(reversed(rows))
```

#### 必要なライブラリをコード <対象>.py に埋め込む

```bash
uv run --with stdlib-list python -c '
import ast, sys, subprocess, stdlib_list

script_path = sys.argv[1]
with open(script_path) as f:
    tree = ast.parse(f.read())

std_libs = set(stdlib_list.stdlib_list())
modules = set()

for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for n in node.names:
            modules.add(n.name.split(".")[0])
    elif isinstance(node, ast.ImportFrom) and node.module:
        modules.add(node.module.split(".")[0])

# 標準ライブラリを除外
third_party = sorted(modules - std_libs)
if third_party:
    print(f"Detected packages: {third_party}")
    cmd = ["uv", "add", "--script", script_path] + third_party
    subprocess.run(cmd)
else:
    print("No third-party packages detected.")
' <対象>.py && chmod +rx <対象>.py
```

### 3. 完全アンインストール (Clean Uninstall)
「管理下の物（パッケージ）も含めて綺麗さっぱり」とのことなので、以下の手順で根こそぎ消す。

**アンインストール**
```bash
uv cache clean && rm -rf "$(uv python dir)" && rm -rf "$(uv tool dir)" && rm -f ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/uvw && rm -f ~/.cargo/bin/uv ~/.cargo/bin/uvx ~/.cargo/bin/uvw
```

### 未分類

```bash
uv python install 3.14t
```

##
