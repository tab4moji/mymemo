## git いろは

### リポジトリ作成

```bash
git init --bare --shared
```

### 状態確認

変化の有無を確認

```bash
git submodule status --recursive && git status && git submodule status --recursive
git ls-files --exclude-standard --modified --others
```

現在のブランチ名

```bash
git branch --show-current
```

履歴表示

```bash
git log --all --graph --topo-order --tags <対象ファイル等>
```

ごみ探査

```bash
git fsck --lost-found
```

過去の清算(lost-found 削除)

```bash
git gc --prune=now
```

### ブランチを呼び接ぎ

```bash
alias git_graft='_() { local MYHEAD=$(git rev-parse HEAD); local BRANCH_CUR="$1"; local BRANCH_NEW="$2"; if git rev-parse --verify "${BRANCH_CUR}" >/dev/null 2>&1; then if git rev-parse --verify "${BRANCH_NEW}" >/dev/null 2>&1; then echo NG; else git branch -m ${BRANCH_CUR} ${BRANCH_NEW} && git checkout -b ${BRANCH_CUR} ${MYHEAD} && git push origin ${BRANCH_NEW} && git push -f origin ${BRANCH_CUR}; fi; else echo NG; fi; }; _'

# 接ぎ木するチェンジセットに移動したあとに...
git_graft main old_main
```

### リポジトリで切り株プランター

「**全履歴・全タグを移行**」しつつ、「**master を main に変更**」して、「**HEAD（デフォルトブランチ）を正常にする**」ための、一番無駄がない完全な手順だ。

この作業は、作業用の適当なディレクトリで行ってくれ。

#### 前提

* **新リポジトリ**は、空っぽ（READMEなどもなし）の状態で作っておくこと。

#### Step 1: 旧リポジトリを「鏡」として取得

まずは全データをそのまま手元に持ってくる。通常の clone ではなく `--mirror` を使う。

```bash
# 旧リポジトリを bare リポジトリとしてクローン
git clone --mirror <旧リポジトリのURL>

# ディレクトリに入る（末尾に .git が付いているはずだ）
cd <旧リポジトリ名>.git

```

#### Step 2: 転送前に master を main に書き換える

手元のデータの段階で、ブランチ名を変更してしまう。これでゴミ（古いmaster）を新リポジトリに送らずに済む。

```bash
# master を main にリネーム
git branch -m master main

```

#### Step 3: 新リポジトリへ投入

手元の整理されたデータを、新リポジトリへ鏡のように写し込む。

```bash
# 新リポジトリへ mirror プッシュ
git push --mirror <新リポジトリのURL>

```

#### Step 4: 仕上げ（HEADの設定）

これが「HEADがない」を防ぐための重要な作業だ。
`push --mirror` だけだと、サーバー側（GitHub/GitLabなど）が「どれをメインに使えばいいの？」と迷って、デフォルトブランチが未設定になることがある。

1. **ブラウザで新リポジトリの設定画面を開く**
2. 「Default Branch（デフォルトブランチ）」の設定項目を探す。
3. **`main` を選択して保存（Update）する。**

これで、次回から `git clone` したときに自動的に `main` がチェックアウトされるようになるし、ブラウザで見たときも `main` が表示される。

#### まとめ

これで、旧リポジトリの歴史をすべて引き継いだ、きれいな `main` 構成の新リポジトリが完成だ。作業に使った `<旧リポジトリ名>.git` フォルダは削除していい。


### ワーキングディレクトリの内容を特定のチェンジセットの内容に置き換え

```bash
alias git_override='_() { local MYTAG="$1"; \git reset --hard HEAD && \git rm -rf . && \git checkout ${MYTAG} -- . && \git add . && \git commit -m "squash merged with ${MYTAG}"; }; _'
git_override <タグ/コミットハッシュ>
```
