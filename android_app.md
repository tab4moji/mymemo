## Android アプリ開発

### アイコン

```bash
# -fuzz 15% : 15%くらいの色の誤差は許容する（これが「ほぼ」の閾値）
# -transparent black : 黒を透明にする
convert input.jpg -fuzz 15% -transparent black output.png
```
