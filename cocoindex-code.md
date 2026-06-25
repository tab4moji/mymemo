## CocoIndex Code

### 概要

CocoIndex エンジンを使ったエージェント向けソースコード検索ツール。

### 公式サイト

- https://cocoindex.io/cocoindex-code/
- https://github.com/cocoindex-io/cocoindex-code

### インストール / アンインストール

- https://github.com/cocoindex-io/cocoindex-code#install

```bash:手動インストール
python3 -m pip install --upgrade cocoindex-code[full]
```

### global_settings.yml

```yaml:~/.cocoindex_code/global_settings.yml
embedding:
  provider: litellm
  model: ollama/embeddinggemma:300m
envs:
  OLLAMA_API_BASE: "http://127.0.0.1:11434"
  OPENAI_API_KEY: "あなたのAPIキー"
```

### プロジェクトでの使用例

- https://github.com/cocoindex-io/cocoindex-code#manual-cli-usage

```bash:フルネームで呼び出し
cocoindex-code init && \
cocoindex-code index && \
cocoindex-code search "最初に動かす関数は、どこ？"
```

```bash:エイリアスで呼び出し
ccc init && \
ccc index && \
ccc search "最初に動かす関数は、どこ？"
```

##
