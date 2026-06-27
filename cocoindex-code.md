## CocoIndex Code

### 概要

CocoIndex エンジンを使ったエージェント向けソースコード検索ツール。

### 公式サイト

- https://cocoindex.io/cocoindex-code/
- https://github.com/cocoindex-io/cocoindex-code

### 起動時の注意

MCPとして追加した cocoindex-code の匿名利用データの送信を無効化。

```bash
export COCOINDEX_TELEMETRY_DISABLED=1
```

勝手なアクセスが不安なら、ip netns / iptables とかを使いましょう

- https://tab4moji.github.io/mymemo/?content=isolate

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
  COCOINDEX_TELEMETRY_DISABLED: 1
  OPENAI_API_KEY: "あなたのAPIキー"
```

### プロジェクトでの使用例

- https://github.com/cocoindex-io/cocoindex-code#manual-cli-usage

```bash:実行
ccc init && \
ccc index && \
ccc search "最初に動かす関数は、どこ？"
```

##
