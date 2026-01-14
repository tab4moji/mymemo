## WSL 用のBashコマンド

### リクエスト

wslのbashのPATHから、/mnt/c/Users/ だとか、/mnt/c/WINDOWS/System32/ とかを消し去りたい。
`paste` コマンドを使って再結合するのが一番きれいに仕上がる。
これをそのまま実行してくれ。

```bash
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '/mnt/c/' | paste -sd: -)

```

### やっていること

1. `tr ':' '\n'`: パス区切りの `:` を改行に変換して、1行1パスにする。
2. `grep -v '/mnt/c/'`: `/mnt/c/` を含む行（Windows側のパス）を除外する。
3. `paste -sd: -`: 残った行を再び `:` で結合する（末尾に余計な `:` が付かないので `tr` で戻すより行儀が良い）。
4. `export PATH=...`: 現在のセッションの環境変数を上書きする。

### 確認

実行後に以下で確認してみてくれ。

```bash
echo $PATH

```

すっきり消えているはずだ。
