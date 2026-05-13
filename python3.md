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

### pytest

pytestのカバレッジ結果（`coverage.json`）を特定のフォルダに出力するには、`pytest-cov`の`--cov-report`オプションを使って出力先のファイルパスを指定すればいい。具体的には、オプションに`json:出力先パス`を渡すだけだ。 [pytest-cov.readthedocs](https://pytest-cov.readthedocs.io/en/latest/reporting.html)

#### コマンドラインで指定する方法
コマンド実行時に引数として指定する場合は、以下のように記述する。コロン（`:`）の後に、フォルダを含めた出力先ファイルパスを指定する仕組みだ。 [pytest-cov.readthedocs](https://pytest-cov.readthedocs.io/en/latest/config.html)

```bash
# srcディレクトリのカバレッジを計測し、reportsフォルダ内にcoverage.jsonを出力する
pytest --cov=src --cov-report=json:reports/coverage.json
```

#### 設定ファイルで指定する方法
毎回コマンドラインで指定するのが面倒な場合は、`pyproject.toml`や`pytest.ini`のデフォルト設定（`addopts`）に組み込んでおくのがおすすめだ。 [qiita](https://qiita.com/ssc-yshikeda/items/d39facb5db154d69681c)

**`pyproject.toml` を使う場合:**
```toml
[tool.pytest.ini_options]
# 常にカバレッジを計測し、指定フォルダにJSON出力する
addopts = "--cov=src --cov-report=json:reports/coverage.json"
```

**`pytest.ini` を使う場合:**
```ini
[pytest]
addopts = --cov=src --cov-report=json:reports/coverage.json
```

なお、出力先のフォルダ（上記の例だと`reports`フォルダ）は、テスト実行時に自動的に生成されない場合がある。もしエラーになるようなら、テスト実行前にそのフォルダを作成しておくか、シェルスクリプトやタスクランナーで事前にディレクトリを生成するステップを挟むようにしてくれ。

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

### 🎯 基本のメモ

#### ライブラリパス

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
sys.path.append('../')
```

#### オブジェクト

```python
class opaque:
    pass

a = opaque()
a.property = 5
```

```python
import types
opaque = types.SimpleNamespace

a = opaque()
a.property = 5
```

```python
a = lambda: None # noqa: E731
a.property = 5 # pylint: disable=no-member
```


#### リスト内包表記で条件抽出
```python
data = [
    {"name": "Alice", "age": 25},
    {"name": "Bob",   "age": 20},
    {"name": "Carol", "age": 30},
]

# age が 25 以上のものだけ
filtered_data = [x for x in data if x["age"] >= 25]
print(filtered_data)

# age が 25 以上のものだけ
filtered_data = list(filter(lambda x: x["age"] >= 25, data))
print(filtered_data)
```
