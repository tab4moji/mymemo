## Python3 メモ

### pip 導入

```python
MYPYTHON=python3 ${MYPYTHON} -m ensurepip && ${MYPYTHON} -m pip install -U pip pipdeptree pip-autoremove pip-audit pip-review && ${MYPYTHON} -m pip install -U $(pipdeptree --warn silence --json-tree | jq -r '.[].key' | paste -sd ' ') && echo; PYTHONWARNINGS="ignore:The global interpreter lock:RuntimeWarning" ${MYPYTHON} $(${MYPYTHON} -m pip show pip | grep Location | cut -d':' -f2)/pip_audit/__main__.py; PYTHONWARNINGS="ignore:The global interpreter lock:RuntimeWarning" ${MYPYTHON} $(${MYPYTHON} -m pip show pip | grep Location | cut -d':' -f2)/pip_review/__main__.py --auto
```

### ruff check で除外したい

Ruffで特定のディレクトリを解析対象から外すには、設定ファイル（`pyproject.toml` または `ruff.toml`）を使うのが一番スマートだ。
方法は大きく分けて2つある。

### 1. 設定ファイルで除外する (推奨)

デフォルトの除外設定（`.git` や `__pycache__` など）を維持しつつ、追加で除外したい場合は `extend-exclude` を使うのがベストだ。

**`pyproject.toml` の場合:**

```toml
[tool.ruff]
# デフォルトの除外リストに加えたい場合 (推奨)
extend-exclude = [
    "migrations",
    "legacy_code",
    "tests/fixtures",
    "path/to/specific_dir",
]

# デフォルトを無視して完全に上書きしたい場合は 'exclude' を使う
# exclude = ["..."] 

```

**`ruff.toml` の場合:**

```toml
# デフォルトの除外リストに加えたい場合
extend-exclude = ["migrations", "legacy_code"]

```

### 2. コマンドライン引数で除外する

一時的に除外したい場合や、ワンライナーで実行する場合は `--exclude` オプションを使う。

```bash
ruff check . --exclude "backups,tools,tmps"

```

### 注意点

* **`.gitignore` の扱い:** Ruffはデフォルトで `.gitignore` に書かれているファイルも無視してくれる。Git管理外にしているなら、あえてRuffの設定に書く必要はないかもしれない。
* **パスの指定:** パスは設定ファイルがある場所からの相対パス、またはグロブパターン（`**/*.py`など）が使える。
