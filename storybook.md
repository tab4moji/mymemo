# StoryBook

## 調査メモ

```bash
$ uv run --python 3.12 -m chat --host 192.168.11.6:11434
[Session Loaded] 0 messages.
--- Streaming Mode: http://192.168.11.6:11434/v1/chat/completions (gemma4-26b-a4b) ---
Type 'exit' to stop. Type '/image <path>' or '/audio <path>' to attach files.

You > 次の文章は小説の一部だ、人物とキーとなるモノ、場所、動作をjsonリスト形式で列挙してくれ({"people": ["jack"], "ite
ms":["long bat"], "places":["grassed ground"], "actions": ["batting"])：
むかし、むかし、あるところに、おじいさんとおばあさんがありました。
AI  > ```json
{
  "people": ["おじいさん", "おばあさん"],
  "items": [],
  "places": ["あるところ"],
  "actions": []
}
```
You > /reset
... thinking ...^C
Bye.
pi@NucBoxK16:storybook$ uv run --python 3.12 -m chat --host 192.168.11.6:11434
[Session Loaded] 0 messages.
--- Streaming Mode: http://192.168.11.6:11434/v1/chat/completions (gemma4-26b-a4b) ---
Type 'exit' to stop. Type '/image <path>' or '/audio <path>' to attach files.

You > 次の文章は小説の一部だ、人物とキーとなるモノ、場所、動作をjsonリスト形式で列挙してくれ({"people": ["jack"], "ite
ms":["long bat"], "places":["grassed ground"], "actions": ["batting"])：
むかし、むかし、あるところに、おじいさんとおばあさんがありました。
AI  > ```json
{
  "people": ["おじいさん", "おばあさん"],
  "items": [],
  "places": ["あるところ"],
  "actions": []
}
```
You > 次の文章は小説の一部だ、人物とキーとなるモノ、場所、動作をjsonリスト形式で列挙してくれ({"people": ["jack"], "ite
ms":["long bat"], "places":["grassed ground"], "actions": ["batting"])：
まいにち、おじいさんは山へしば刈りに、おばあさんは川へ洗濯に行きました。
AI  > ```json
{
  "people": ["おじいさん", "おばあさん"],
  "items": ["しば"],
  "places": ["山", "川"],
  "actions": ["しば刈り", "洗濯"]
}
```
You > 次の文章は小説の一部だ、人物とキーとなるモノ、場所、動作をjsonリスト形式で列挙してくれ({"people": ["jack"], "ite
ms":["long bat"], "places":["grassed ground"], "actions": ["batting"])：
ある日、おばあさんが、川のそばで、せっせと洗濯をしていますと、川上から、大きな桃が一つ、「ドンブラコッコ、スッコッ コ
。ドンブラコッコ、スッコッコ。」と流れて来ました。
AI  > ```json
{
  "people": ["おばあさん"],
  "items": ["大きな桃"],
  "places": ["川のそば", "川上"],
  "actions": ["洗濯をしています", "流れて来ました"]
}
```
You >

Bye.
```
