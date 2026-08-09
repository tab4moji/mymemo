## エージェント

### エージェントチック

```bash:ドキュメント生成
#!/usr/bin/env -S bash -ic 'source "$0"'
set -eu
set +m; shopt -s lastpipe
shopt -s extglob

# 作業ディレクトリ作成
################################################################

mkdir -p .myagent_works/

# 対象ファイルを列挙する
################################################################

find ./ -name "*.bash" -o -name "*.py" | grep -v "site-packages" | grep -vE "\/\." | sort -g | tee .myagent_works/target_files.lst
echo "---- files."

# 対象ファイルを mapfile してループする
################################################################

cat .myagent_works/target_files.lst | {
    mapfile -t target_files
    mkdir -p .myagent_works/descs/

    # 各対象ファイルをループする
    ################################

    for target_file in ${target_files[@]}
    do
        desc_file=".myagent_works/descs/$(basename ${target_file}).overview.md"
        desc_file2=".myagent_works/descs/$(basename ${target_file}).detail.md"
        if [[ -e "${desc_file}" && -e "${desc_file2}" ]]
        then
            # すでにファイルがあるのでスキップ
            ################################

            echo "${target_file} ... skipped"
        else
            # 説明文作成
            ################################

            opencode_prompt=$(cat << EOS

${target_file} を読んで処理の概要と詳細の２つの説明を記載して欲しい。

まず、細かな処理内容を ${desc_file2} に記載してくれ。
必ずファイル内部を処理単位に分けて理解して、処理ごとに入力がどんな方法(引数や読み込むファイル)で入力がどんなもの(日付、ファイル名)なのかを説明すること。
どんな処理で、出力として、どんな方法でどんな結果が得られるかを説明すること。

---詳細サンプル:begin
# 処理詳細: 価格トリガー生成

## 1. パラメータ解析・バリデーション
- **目的**: スクリプト実行時に渡された引数を変数に格納し、必須パラメータの不足や日付指定の不備をチェックする。
- **入力(コマンドライン引数)**:
    - FROM_DATE, TO_DATE: 日付文字列 (YYYY-MM-DD)。
    - TP_RATIO, POWER: 浮動小数点。
    - DURATION, PROCESS: 数値。
    - FORCE: フラグ（--force があれば 1）。
- **出力**: 変数への格納、またはエラーメッセージを表示して終了。

## 2. ディレクトリ準備とコマンドリスト作成
- **目的**: 出力先ディレクトリを作成し、並列実行用の処理命令をまとめたファイルを用意する。
- **入力**: なし（スクリプト内のパス指定および既存のディレクトリ確認)
- **出力**:
    - pytorch_wsl/dataset_chunks/: ディレクトリの作成。
    - tmp/backtest/: ディレクトリの作成。
    - tmp/backtest/phase1_5_commands.txt:（コマンドリストファイル）の初期化。
---詳細サンプル:end

次に、概要を${desc_file} に記載してくれ。
細かな処理内容は説明せずにファイル全体としてみたときの機能を markdown 形式で簡潔に記載すること。
ファイル全体としての機能名も考えて、それも記載すること。

---概要サンプル:begin
# 機能名: モジュールディレクトリ情報取得スクリプト

## 概要
sources/ ディレクトリ内にある特定のサブディレクトリ（名前が _sub で終わるもの、または uefpy や lib_compat）を検索し、その一覧を表示する機能。
---概要サンプル:end
EOS
)
            echo
            echo "user:"
            echo "${opencode_prompt}"
            echo
            echo "opencode:"
            \opencode run "${opencode_prompt}"
        fi
    done
}
```

#### メモ

git add . したあとに git diff と git diff --cached で差分を確認して、差分があればコミットメッ セージを考えて日本語でコミットとプッシュしてくれ" プッシュしてくれ

```example:begin
H1 SMA 5, 25, 75, 200 およびトレンド傾きの完全拡張と次元数の同期 (1,386次元)

- データセット生成、モデル入力、および検証ツールの次元数を H1 全拡張に合わせて更新
- 1銘柄あたりの次元数を 160 から 198 へ拡張し、合計 1,386 次元へ統合
- uefpy のログ出力処理をコメントアウトにより無効化
```example:end

##
