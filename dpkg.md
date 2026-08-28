## aptを使いたい

### sudo パスワード無しにする

```bash
_() {
    local u="$1"; \
    sudo_filename="/etc/sudoers.d/90-nopasswd"; \
    local c="$u ALL=(ALL) NOPASSWD: ALL"; \
    if [[ ! -f "$sudo_filename" ]]; then \
        echo "$c" | sudo tee "$sudo_filename" >/dev/null; \
        echo "Created: $sudo_filename"; \
    elif ! sudo grep -q "^$u .*NOPASSWD: ALL" "$sudo_filename"; then \
        echo "$c" | sudo tee -a "$sudo_filename" >/dev/null; \
        echo "Appended to: $sudo_filename"; \
    else \
        echo "Already exists."; \
    fi; \
    sudo chmod 0440 "$sudo_filename"; \
}; \
_ $(whoami) # 関数呼び出し
```

### Ubuntu バージョン

```bash
lsb_release -sc 2>/dev/null
```

```bash
do-release-upgrade -c 2>/dev/null | grep -v "There is no " | grep -w available | cut -d\' -f2
```

### apt

```bash:アーキテクチャ表示
echo "-- lsb_release"; lsb_release -a; echo "-- architecture"; dpkg --print-architecture; echo "-- foreign-architectures"; dpkg --print-foreign-architectures
```

```bash:Debian Code Names
uv run --with requests,beautifulsoup4 python -c '
import csv, sys, requests, bs4
soup = bs4.BeautifulSoup(requests.get("https://www.debian.org/releases/").text, "html.parser")
rows = [[td.get_text(" ", strip=True) for td in tr.find_all("td")] for tr in soup.find("table").find_all("tr") if tr.find("td")]
w = csv.writer(sys.stdout)
w.writerow(["version", "codename", "release_date", "eol_date", "eol_lts", "eol_elts", "status"])
w.writerows(reversed(rows))
'
```

```bash: 修正apt
_() { \
    DEBIAN_FRONTEND=noninteractive; \
    sudo -E apt-get install --fix-missing --fix-broken --autoremove -y; \
}; \
_ # 関数呼び出し
```

```bash
_() { \
    DEBIAN_FRONTEND=noninteractive; \
    sudo -E apt-get purge --fix-missing --fix-broken --autoremove -y libx11-6 xfonts* && \
    sudo -E apt-get update && \
    sudo -E apt-get dist-upgrade --fix-missing --fix-broken -y && \
    [[ $(which lsb_relase) ]] || sudo -E apt-get install lsb-release git --fix-missing --fix-broken -y && echo && \
    lsb_release -a && \
    sudo -E apt-get install -y --fix-missing --fix-broken ubuntu-release-upgrader-core update-manager-core && \
    relver="$(do-release-upgrade -c | grep -w available | cut -d\' -f2)" && \
    codename="$(curl -fsSL https://changelogs.ubuntu.com/meta-release | grep -B 4 "${relver}" | grep -v tar.gz | grep -w "Dist" | cut -d' ' -f2)" && \
    [[ "${codename}" != "" ]] && old_codename="$(lsb_release -sc)" && \
    echo "${old_codename} -> ${codename}" && \
    [[ ! -f /etc/apt/sources.list.${old_codename}.tgz ]] && \
    sudo -E tar czf /etc/apt/sources.list.${old_codename}.tgz /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null || echo "None." && \
    sudo -E find /etc/apt/sources.list /etc/apt/sources.list.d -type f \( -name 'sources.list' -o -name '*.list' -o -name '*.sources' \) -exec sed -Ei.bak -e "/^\s*deb(-src)?\s/ s/\b${old_codename}\b/${codename}/g" -e "/^\s*Suites:/ s/\b${old_codename}(-updates|-security|-backports)?\b/${codename}\1/g" {} + && \
    sudo -E apt-get update --fix-missing; \
    sudo -E apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confnew" full-upgrade --fix-missing --fix-broken --autoremove --purge -y; \
}; \
_ # 関数呼び出し
```
