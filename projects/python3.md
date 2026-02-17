## Python3 メモ

### pip 導入

```python
_() { \
    local PYTHON_CMD="${1:-python3}"; \
    ${PYTHON_CMD} -m ensurepip && \
    ${PYTHON_CMD} -m pip install -U pip pipdeptree pip-autoremove pip-audit && \
    local PIP_DIR_PATH="$(${PYTHON_CMD} -m pip show pip | grep Location | cut -d':' -f2)"; \
    PYTHONWARNINGS="ignore:The global interpreter lock:RuntimeWarning" ${PYTHON_CMD} ${PIP_DIR_PATH}/pip_audit/__main__.py; \
}; \
_ python3 # 関数実行
```

### python バージョン指定コマンド呼び出し(一部可能)

```python
alias pycall='_() { local PYTHON_CMD="python3"; local PIP_DIR_PATH="$(${PYTHON_CMD} -m pip show pip | grep Location | cut -d':' -f2)"; local PYTHON_SUBCMD="$1"; shift; PYTHONWARNINGS="ignore:The global interpreter lock:RuntimeWarning" ${PYTHON_CMD} ${PIP_DIR_PATH}/${PYTHON_SUBCMD}/__main__.py $@; }; _'
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
