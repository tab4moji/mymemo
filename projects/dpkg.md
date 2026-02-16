## aptを使いたい

### sudo パスワード無しにする

```bash
_() { local u="$1" f="/etc/sudoers.d/90-nopasswd"; local c="$u ALL=(ALL) NOPASSWD: ALL"; if [ ! -f "$f" ]; then echo "$c" | sudo tee "$f" >/dev/null; echo "Created: $f"; elif ! sudo grep -q "^$u .*NOPASSWD: ALL" "$f"; then echo "$c" | sudo tee -a "$f" >/dev/null; echo "Appended to: $f"; else echo "Already exists."; fi; sudo chmod 0440 "$f"; }; _ $(whoami)
```

### Ubuntu バージョン

```bash
lsb_release -sc 2>/dev/null
```

```bash
do-release-upgrade -c 2>/dev/null | grep -v "There is no " | grep -w available | cut -d\' -f2
```

### apt

```bash
_() { DEBIAN_FRONTEND=noninteractive; sudo -E apt-get install --fix-missing --fix-broken --autoremove -y; }; _
```

```bash
_() {
    DEBIAN_FRONTEND=noninteractive;
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
    sudo tar czf /etc/apt/sources.list.${old_codename}.tgz /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null || echo "None." && \
    sudo find /etc/apt/sources.list /etc/apt/sources.list.d -type f \( -name 'sources.list' -o -name '*.list' -o -name '*.sources' \) -exec sed -Ei.bak -e "/^\s*deb(-src)?\s/ s/\b${old_codename}\b/${codename}/g" -e "/^\s*Suites:/ s/\b${old_codename}(-updates|-security|-backports)?\b/${codename}\1/g" {} + && \
    sudo -E apt-get update --fix-missing;
    sudo -E apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confnew" full-upgrade --fix-missing --fix-broken --autoremove --purge -y
}; _
```
