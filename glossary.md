## 用語集

### コードスタイル（Code Style / Formatting）:見た目の統一
インデントの幅、スペースの使い方、波括弧の位置、変数の命名規則（キャメルケースかスネークケースか）などが該当する 。 [en.wikipedia](https://en.wikipedia.org/wiki/Programming_style)
これはプログラムのアルゴリズムや挙動には一切影響を与えず、純粋に「人間の可読性の向上」と「チーム内での認知負荷の軽減」を目的としている 。 [shadecoder](https://www.shadecoder.com/topics/what-is-code-style-a-practical-guide-for-2025)
現在の開発現場では、この領域は人間が手動で気にするものではなくなりつつある。Pythonの `Black` やJavaScriptの `Prettier`、C/C++の `clang-format` などの「Formatter（フォーマッター）」と呼ばれる自動整形ツールに一任するのが英語圏を含めた世界的な標準だ 。 [blog.codacy](https://blog.codacy.com/coding-standards)

### コーディング標準（Coding Standards / Best Practices）:ロジックと設計の制約
「誤差を避けるために金額計算には浮動小数点（Float）ではなくDecimalを使う」「if文の条件節で副作用のある関数呼び出しをしない」といったルールはこちらに該当する 。 [anderson02](https://anderson02.com/cs/cskiso/cskisoniwari-04/)
これらは見た目ではなく、バグの未然防止、保守性、セキュリティ、パフォーマンスの担保を目的としている。英語圏では「Coding Standards（コーディング標準）」や「Best Practices（ベストプラクティス）」、「Programming Idioms（イディオム）」として区別して語られることが多い 。 [blog.codacy](https://blog.codacy.com/coding-standards)
この領域の違反を検出するために使われるのが、`ESLint`、`Pylint`、`SonarQube` などの「Linter（リンター）」や静的解析ツールだ。
近年は「Style（見た目）の議論はフォーマッターに任せて終わらせ、コードレビューでは Standards（ロジックの妥当性）に集中する」という合理的なアプローチが主流になっている 。 [shadecoder](https://www.shadecoder.com/topics/what-is-code-style-a-practical-guide-for-2025)
