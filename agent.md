## OpenCode でエージェント

### エージェント風 bash スクリプト

カレントディレクトリの *.sh *.bash *.py *.c *.cpp *.rust を検索して、それについてのドキュメントを .opencode_agent_works/documents/ 以下に作成する。

```bash:ドキュメント生成
#!/usr/bin/env -S bash -ic 'source "$0"'
set -eu
set +m; shopt -s lastpipe
shopt -s extglob

# 作業ディレクトリ作成
################################################################

mkdir -p .opencode_agent_works/

# 対象ファイルを列挙する
################################################################

find . -type f \( -name "*.bash" -o -name "*.sh" -o -name "*.c" -o -name "*.cpp" -o -name "*.rust" -o -name "*.py" \) -printf "%h~\t%p\n" | LC_ALL=C sort | cut -f2 | grep -v "site-packages" | grep -vw tmp | grep -vE "\/\." | tee .opencode_agent_works/target_files.lst
echo "---- files."
echo

# 対象ファイルを mapfile してループする
################################################################

cat .opencode_agent_works/target_files.lst | {
    mapfile -t target_files
    mkdir -p .opencode_agent_works/documents/

    # ループ処理を始める前の初期化
    ################################

    target_dir=""

    # 各対象ファイルをループする
    ################################

    for target_file in ${target_files[@]}
    do
        if [[ "${target_dir}" != "" && "$(dirname "${target_file}")" != "${target_dir}" ]]
        then

            # ディレクトリ全体を説明する
            ################################

            doc_dir_overview="$(echo "${target_dir}" | sed -E "s/^\.\///g")"
            target_dir_overviews=".opencode_agent_works/documents/${doc_dir_overview}"
            doc_dir_hash="${target_dir_overviews}.overview.hash"
            doc_dir_overview="${target_dir_overviews}.overview.md"

            overview_files_to_be_read="$(\ls -1 ${target_dir_overviews}/*.overview.md)"
            doc_dir_tmp="${target_dir_overviews}.overview.tmp"
            rm -f "${doc_dir_tmp}"
            echo "${overview_files_to_be_read}" | { mapfile -t overview_docs; for overview_doc in "${overview_docs[@]}"; do cat "${overview_doc}" >> "${doc_dir_tmp}"; done; }
            target_hash="$(md5sum -b "${doc_dir_tmp}" | cut -d' ' -f1)"
            overview_files_to_be_read="$(\ls -1 ${target_dir_overviews}/*.overview.md | sed -E 's/\.opencode_agent_works/@\.opencode_agent_works/g')"

            if [[ -e "${doc_dir_overview}" && "$(cat "${doc_dir_hash}" 2>/dev/null)" == "${target_hash}" ]]
            then

                # すでに説明があるのでスキップ
                ################################

                echo "${doc_dir_overview} ... skipped"
            else

                opencode_prompt=$(cat << EOS

以下のファイルを統合した内容についての概要を説明して、出力フォーマットに従って出力すること。
${overview_files_to_be_read}

出力する説明を考えるときは、細かな処理内容は説明せずにファイル全体としてみたときの機能を markdown 形式で簡潔に記載すること。
ファイル全体としての機能名も考えて、それも記載すること。

\`\`\`markdown:出力フォーマット
# 機能名: 計算モジュール

## 概要
計算ライブラリ
\`\`\`
EOS
)
                # echo "${opencode_prompt}"
                # echo
                # echo "user:"
                echo "${opencode_prompt}"
                echo "${overview_files_to_be_read}"
                echo
                echo "opencode:"
                \opencode run "${opencode_prompt}" 2>/dev/null | tee "${doc_dir_overview}.tmp" && echo "${target_hash}" > "${doc_dir_hash}" && mv "${doc_dir_overview}.tmp" "${doc_dir_overview}"
            fi
        fi

        target_dir="$(dirname "${target_file}")"

        # 個別ファイルを説明する
        ################################

        target_file="$(echo "${target_file}" | sed -E "s/^\.\///g")"
        target_hash="$(md5sum -b "${target_file}" | cut -d' ' -f1)"
        doc_file_hash=".opencode_agent_works/documents/${target_file}.hash"
        doc_file_overview=".opencode_agent_works/documents/${target_file}.overview.md"
        doc_file_detail=".opencode_agent_works/documents/${target_file}.detail.md"
        doc_file_gloss=".opencode_agent_works/documents/${target_file}.glossary.md"
        mkdir -p "$(dirname "${doc_file_detail}")"

        if [[ -e "${doc_file_detail}" && "$(cat "${doc_file_hash}" 2>/dev/null)" == "${target_hash}" ]]
        then
            # すでに説明があるのでスキップ
            ################################

            echo "${doc_file_detail} ... skipped"

        elif [[ -s "${target_file}" ]]
        then
            # 詳細な説明文を作成する
            ################################

            opencode_prompt_detail=$(cat << EOS

以下のファイルの内容についての各機能の説明を出力フォーマットに従って出力すること。
@${target_file}

出力する説明を考えるときは、必ずファイル内部を処理単位に分けて理解して、処理ごとに入力がどんな方法(引数や読み込むファイル)で入力がどんなもの(日付、ファイル名)なのかを説明すること。
どんな処理で、出力として、どんな方法でどんな結果が得られるかを説明すること。
外部から該当する機能を呼び出すためのインターフェース関数を必須としてやサブ関数、グローバル変数もシンボル一覧として列挙すること。
ただし、列挙するシンボルはコード内部で定義されていること。

\`\`\`markdown:出力フォーマット
# 処理詳細: 価格トリガー生成

## 1. パラメータ解析・バリデーション
- **機能**: スクリプト実行時に渡された引数を変数に格納し、必須パラメータの不足や日付指定の不備をチェックする。
- **入力(コマンドライン引数)**:
    - FROM_DATE, TO_DATE: 日付文字列 (YYYY-MM-DD)。
    - TP_RATIO, POWER: 浮動小数点。
    - DURATION, PROCESS: 数値。
    - FORCE: フラグ（--force があれば 1）。
- **出力**: 変数への格納、またはエラーメッセージを表示して終了。
- **シンボル**: validate_parameters(), all_parameters

## 2. ディレクトリ準備とコマンドリスト作成
- **機能**: 出力先ディレクトリを作成し、並列実行用の処理命令をまとめたファイルを用意する。
- **入力**: なし（スクリプト内のパス指定および既存のディレクトリ確認)
- **出力**:
    - pytorch_wsl/dataset_chunks/: ディレクトリの作成。
    - tmp/backtest/: ディレクトリの作成。
    - tmp/backtest/phase1_5_commands.txt:（コマンドリストファイル）の初期化。
- **シンボル**: setup_directory(), target_directories
\`\`\`
EOS
)
            # echo
            # echo "user:"
            # echo "${opencode_prompt_detail}"
            echo
            echo "opencode:"
            echo "${target_file}"
            \opencode run "${opencode_prompt_detail}" 2>/dev/null | tee "${doc_file_detail}.tmp" && mv "${doc_file_detail}.tmp" "${doc_file_detail}"
        else

            # 説明する対象ファイルサイズが 0 なのでスキップ
            ################################

            echo "${doc_file_detail} ... skipped (0 bytes code)"
        fi

        if [[ -e "${doc_file_overview}" && "$(cat "${doc_file_hash}" 2>/dev/null)" == "${target_hash}" ]]
        then

            # すでに説明があるのでスキップ
            ################################

            echo "${doc_file_overview} ... skipped"

        elif [[ -s "${target_file}" ]]
        then

            # 概要的な説明文を作成する
            ################################

            opencode_prompt_overview=$(cat << EOS
以下のファイルの内容についての概要を出力フォーマットに従って出力すること。
@${target_file}

出力する概要を考えるときは、細かな処理内容は説明せずにファイル全体としてみたときの機能を markdown 形式で簡潔に記載すること。
ファイル全体としての機能名も考えて、それも記載すること。

\`\`\`markdown:出力フォーマット
# 機能名: モジュールディレクトリ情報取得スクリプト

## 概要
sources/ ディレクトリ内にある特定のサブディレクトリ（名前が _sub で終わるもの、または uefpy や lib_compat）を検索し、その一覧を表示する機能。
\`\`\`
EOS
)
            # echo
            # echo "user:"
            # echo "${opencode_prompt_overview}"
            echo
            echo "opencode:"
            echo "${target_file}"
            \opencode run "${opencode_prompt_overview}" 2>/dev/null | tee "${doc_file_overview}.tmp" && echo "${target_hash}" > "${doc_file_hash}" && mv "${doc_file_overview}.tmp" "${doc_file_overview}"
        else
            # 説明する対象ファイルサイズが 0 なのでスキップ
            ################################

            echo "${doc_file_overview} ... skipped (0 bytes code)"
        fi

        if [[ -e "${doc_file_gloss}" && "$(cat "${doc_file_hash}" 2>/dev/null)" == "${target_hash}" ]]
        then

            # すでに用語集があるのでスキップ
            ################################

            echo "${doc_file_gloss} ... skipped"

        elif [[ -s "${target_file}" ]]
        then

            # 用語集を作成する
            ################################

            opencode_prompt_glossary=$(cat << EOS
以下のファイルの中に含まれる用語を出力フォーマットに従って出力すること。
@${target_file}

出力する用語は、ソフトウェア開発で頻繁に見られる言葉は出力しないこと。
関数名に含まれて認識可能な用語も抽出すること。例: make_chart_record -> chart record

\`\`\`markdown:出力フォーマット
- 深度
- Depth
- メートル
- Chart Record
\`\`\`
EOS
)
            # echo
            # echo "user:"
            # echo "${opencode_prompt_glossary}"
            echo
            echo "opencode:"
            echo "${target_file}"
            \opencode run "${opencode_prompt_glossary}" 2>/dev/null | tee "${doc_file_gloss}.tmp" && echo "${target_hash}" > "${doc_file_hash}" && mv "${doc_file_gloss}.tmp" "${doc_file_gloss}"
        else
            # 対象ファイルサイズが 0 なのでスキップ
            ################################

            echo "${doc_file_gloss} ... skipped (0 bytes code)"
        fi
     done
}
```

### ここからは雑多な OpenCode を使うためのメモ

```markdown:コード分析
- このプロジェクトに含まれるドキュメントファイルとソースコードファイルに何があるか一覧を探して "./.works/docs_and_codes_<現在時刻>.md" というファイル名に記録せよ。本文中にも現在時刻を記録せよ。
```

```markdown:システム指示 ~/.config/opencode/AGENTS.md
- 必ず日本語で報告すること。
- 会話やコマンドでディレクトリー名を扱うときには必ず最後に/を付けること(例: ~/.config/)。
- ファイルを探すときは、ls コマンドを使わずに、-name または -iname でワイルドカードを加えて find コマンドを使うこと。
- 作業記録を書くときは、記録ファイルへ現在時刻を含んだタイトルで日記形式で作業内容を追加書き込みすること。
- 現在時刻をファイル名に含めるときは以下の形式を使うこと。
  - date +%Y_%m%d_%H%M_%S
- 文章の最後に「？」などがあって明確に質問文になっていたら、コード修正やコード実行などはせずに、質問に回答だけをすること。知らない、分からない、未だやっていないことがあれば正直に回答すること。
- 作業を依頼されたら、依頼された作業だけをせよ。依頼が終わったら、すぐに日本語で完了した内容とできなかったことを報告すること。
- コードの調査や編集や作成には必ず aider-mcp-server を使うこと。
- コードの調査ではなるべく Grep を使わずに cocoindex-code を使うこと。
- 必ず日本語で報告すること。

Aiderはコードの自動記述だけでなく、**既存コードの調査や理解（コードリーディング、リバースエンジニアリング）にも非常に 強力なツール**として活用できます。
ファイル編集を行わずにコードベース全体を俯瞰して分析するための仕組みと専用のコマンドが備わっており、開発コミュニティでも「コードを読むための神器」として評価されています。
Aiderがコード調査に優れている理由と、具体的な使い方を解説します。

### 1. リポジトリ全体の構造を把握する「Repo Map」
AiderがただのチャットAIと異なる最大の理由は、コードベース全体の依存関係を理解する**Repo Map（リポジトリマップ）**機能 です。

- **Tree-sitterによる構文解析**: リポジトリ内の全ファイルを解析してAST（抽象構文木）を生成し、関数、クラス、変数などのシンボルを抽出します。
- **PageRankアルゴリズムによる重要度計算**: ファイル間の参照関係（importや関数呼び出しなど）をネットワークグラフ化し、PageRankアルゴリズムを用いて「どのファイル・シンボルがアーキテクチャ上重要か」をスコアリングします。

これにより、人間が関連ファイルをすべて手動で教えなくても、Aiderはプロジェクト全体の構造を背景知識（コンテキスト）とし て持った状態で回答できます。

### 2. 調査・分析に特化したコマンドとモード
Aiderにはコードを不用意に書き換えさせず、調査に専念させるためのモードが用意されています。

- **`/ask <質問>` （Askモード）**
  コードの変更を一切行わず、質問や分析のみを行うモードです。
  *「この決済処理のロジックはどのファイルに書かれている？」「この関数の時間計算量とボトルネックは？」「このクラスの役 割を説明して」* といったコードリーディングに最適です。
- **`/map`**
  現在Aiderが認識しているリポジトリマップ（関連性の高いクラスや関数の依存ツリー）をターミナル上に表示します。プロジェ クトの全体像を把握したい場合に便利です。
- **`/architect` （Architectモード）**
  コードを修正する際の「設計・計画」を行うモードです。OpenAI o1やo3-miniのような推論特化モデルをArchitect（設計者）と して動かし、リファクタリングの方針やアーキテクチャの改善案を立案させることができます（実際のコード編集は別の安価なEditorモデルが行う2段構成になります）。

### 3. Aiderを使ったコード調査の推奨ワークフロー
公式やコミュニティで推奨されている、大規模なコードベースを読み解く際の効果的なアプローチは以下の通りです。

1. **機能の特定（当たりをつける）**
   まずは変更・調査したい機能について尋ねます。
   `> /ask FXの自動発注機能のエントリーポイントはどのファイルにありますか？`
   （AiderがRepo Mapから推測して該当ファイルやクラスを提示してくれます）
2. **対象ファイルの追加**
   特定したファイルを明示的にコンテキストに追加し、より深く解析させます。
   `> /add src/trading/order_manager.py`
3. **詳細な分析とリバースエンジニアリング**
   追加したファイルに対して詳細な質問を投げます。
   `> /ask このクラスが依存している外部APIの呼び出しフローをマークダウンでまとめて`
   `> /ask このモジュールの仕様書をリバースエンジニアリングして作成して`
4. **（必要であれば）実装の反映**
   仕様を完全に把握し、方針が固まったら `/code` コマンドで実際の改修を依頼します。

このように、Aiderは「AIに考えさせてコードを書かせる」前の**「複雑なシステムの仕様を解きほぐす」フェーズ**で非常に役立 ちます。Pythonやシステムアーキテクチャの設計など、高度なエンジニアリングを行う際の強力な分析アシスタントとしてぜひ試してみてください。
```


##
