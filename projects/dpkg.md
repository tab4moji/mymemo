## aptを使いたい

### Ubuntu バージョン

```bash
lsb_release -sc 2>/dev/null
```

```bash
do-release-upgrade -c 2>/dev/null | grep -v "There is no " | grep -w available | cut -d\' -f2
```
