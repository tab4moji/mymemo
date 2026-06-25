## CocoIndex Code

### 概要

CocoIndex エンジンを使ったエージェント向けソースコード検索ツール。

### 公式サイト

- hhttps://cocoindex.io/cocoindex-code/
- https://github.com/cocoindex-io/cocoindex-code

### インストール / アンインストール

- https://github.com/cocoindex-io/cocoindex-code#install

```bash:手動
python3 -m pip install --upgrade cocoindex-code[full]
```

### opencode.json 設定

```yaml:~/.cocoindex_code/global_settings.yml
embedding:
  provider: litellm
  model: ollama/embeddinggemma:300m
envs:
  OLLAMA_API_BASE: "http://127.0.0.1:11434"
  OPENAI_API_KEY: "あなたのAPIキー"
```

- https://github.com/cocoindex-io/cocoindex-code#manual-cli-usage

```bash:フルネーム
cocoindex-code init
cocoindex-code index
cocoindex-code search "最初に動かす関数は、どこ？"
```

```bash:エイリアス
ccc init
ccc index
ccc search "最初に動かす関数は、どこ？"
```

##
