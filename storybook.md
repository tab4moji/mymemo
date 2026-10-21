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

AI  > 
{
  "people": ["おじいさん", "おばあさん"],
  "items": [],
  "places": ["あるところ"],
  "actions": []
}

You > 次の文章は小説の一部だ、人物とキーとなるモノ、場所、動作をjsonリスト形式で列挙してくれ({"people": ["jack"], "ite
ms":["long bat"], "places":["grassed ground"], "actions": ["batting"])：
まいにち、おじいさんは山へしば刈りに、おばあさんは川へ洗濯に行きました。

AI  >
{
  "people": ["おじいさん", "おばあさん"],
  "items": ["しば"],
  "places": ["山", "川"],
  "actions": ["しば刈り", "洗濯"]
}

You > 次の文章は小説の一部だ、人物とキーとなるモノ、場所、動作をjsonリスト形式で列挙してくれ({"people": ["jack"], "ite
ms":["long bat"], "places":["grassed ground"], "actions": ["batting"])：
ある日、おばあさんが、川のそばで、せっせと洗濯をしていますと、川上から、大きな桃が一つ、「ドンブラコッコ、スッコッ コ
。ドンブラコッコ、スッコッコ。」と流れて来ました。

AI  >
{
  "people": ["おばあさん"],
  "items": ["大きな桃"],
  "places": ["川のそば", "川上"],
  "actions": ["洗濯をしています", "流れて来ました"]
}

You >

Bye.
```

## 実験

```bash
$ cat momotaro.md | python3 split_sentences.py | python3 processor.py --limit 10
```json
{
  "entities": [
    {
      "surface": "おじいさん",
      "type": "Actor",
      "resolution": "NEW",
      "id": "actor_ojiisan",
      "name": "おじいさん"
    },
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "NEW",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "あるところ",
      "type": "Location",
      "resolution": "NEW",
      "id": "loc_somewhere",
      "name": "あるところ"
    }
  ],
  "events": [
    {
      "action_type": "STATE_CHANGE",
      "subject": "actor_ojiisan",
      "inference": "明示",
      "target": null,
      "location": "loc_somewhere",
      "destination": null,
      "item": null,
      "topic": null,
      "description": "存在していた"
    },
    {
      "action_type": "STATE_CHANGE",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": "loc_somewhere",
      "destination": null,
      "item": null,
      "topic": null,
      "description": "存在していた"
    }
  ]
}
```
{"sentence_id": 2, "text": "むかし、むかし、あるところに、おじいさんとおばあさんがありました。", "entities": [{"surface": "おじいさん", "type": "Actor", "resolution": "NEW", "id": "actor_ojiisan", "name": "おじいさん"}, {"surface": "お ばあさん", "type": "Actor", "resolution": "NEW", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "あるところ", "type": "Location", "resolution": "NEW", "id": "loc_somewhere", "name": "あるところ"}], "events": [{"action_type": "STATE_CHANGE", "subject": "actor_ojiisan", "inference": "明示", "target": null, "location": "loc_somewhere", "destination": null, "item": null, "topic": null, "description": "存在していた"}, {"action_type": "STATE_CHANGE", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": "loc_somewhere", "destination": null, "item": null, "topic": null, "description": "存在していた"}]}
[1/10] sentence 2 ok
```json
{
  "entities": [
    {
      "surface": "おじいさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_ojiisan",
      "name": "おじいさん"
    },
    {
      "surface": "山",
      "type": "Location",
      "resolution": "NEW",
      "id": "loc_mountain",
      "name": "山"
    },
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "川",
      "type": "Location",
      "resolution": "NEW",
      "id": "loc_river",
      "name": "川"
    }
  ],
  "events": [
    {
      "action_type": "MOVEMENT",
      "subject": "actor_ojiisan",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": "loc_mountain",
      "item": null,
      "topic": null,
      "description": "山へしば刈りに行く"
    },
    {
      "action_type": "MOVEMENT",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": "loc_river",
      "item": null,
      "topic": null,
      "description": "川へ洗濯に行く"
    }
  ]
}
```
{"sentence_id": 3, "text": "まいにち、おじいさんは山へしば刈りに、おばあさんは川へ洗濯に行きました。", "entities": [{"surface": "おじいさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_ojiisan", "name": "おじいさん"}, {"surface": "山", "type": "Location", "resolution": "NEW", "id": "loc_mountain", "name": "山"}, {"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "川", "type": "Location", "resolution": "NEW", "id": "loc_river", "name": "川"}], "events": [{"action_type": "MOVEMENT", "subject": "actor_ojiisan", "inference": "明示", "target": null, "location": null, "destination": "loc_mountain", "item": null, "topic": null, "description": "山へしば刈りに行く"}, {"action_type": "MOVEMENT", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": null, "destination": "loc_river", "item": null, "topic": null, "description": "川へ洗濯に行く"}]}
[2/10] sentence 3 ok
```json
{
  "entities": [
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "川",
      "type": "Location",
      "resolution": "EXISTING",
      "id": "loc_river",
      "name": "川"
    },
    {
      "surface": "大きな桃",
      "type": "Item",
      "resolution": "NEW",
      "id": "item_peach",
      "name": "大きな桃"
    }
  ],
  "events": [
    {
      "action_type": "PHYSICAL_ACTION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": null,
      "topic": null,
      "description": "せっせと洗濯をする"
    },
    {
      "action_type": "MOVEMENT",
      "subject": "item_peach",
      "inference": "明示",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": "item_peach",
      "topic": null,
      "description": "川上から流れて来る"
    }
  ]
}
```
{"sentence_id": 4, "text": "ある日、おばあさんが、川のそばで、せっせと洗濯をしていますと、川上から、大きな桃が一つ、「ドンブラコッコ、スッコッコ。ドンブラコッコ、スッコッコ。」と流れて来ました。", "entities": [{"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "川", "type": "Location", "resolution": "EXISTING", "id": "loc_river", "name": "川"}, {"surface": "大きな桃", "type": "Item", "resolution": "NEW", "id": "item_peach", "name": "大きな桃"}], "events": [{"action_type": "PHYSICAL_ACTION", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": "loc_river", "destination": null, "item": null, "topic": null, "description": "せっせと洗濯をする"}, {"action_type": "MOVEMENT", "subject": "item_peach", "inference": "明示", "target": null, "location": "loc_river", "destination": null, "item": "item_peach", "topic": null, "description": "川上 から流れて来る"}]}
[3/10] sentence 4 ok
```json
{
  "entities": [
    {
      "surface": "おじいさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_ojiisan",
      "name": "おじいさん"
    },
    {
      "surface": "桃",
      "type": "Item",
      "resolution": "EXISTING",
      "id": "item_peach",
      "name": "大きな桃"
    },
    {
      "surface": "うち",
      "type": "Location",
      "resolution": "NEW",
      "id": "loc_obaasan_house",
      "name": "おばあさんの家"
    }
  ],
  "events": [
    {
      "action_type": "COMMUNICATION",
      "subject": "actor_obaasan",
      "inference": "補完",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": null,
      "topic": "桃をみごとなものだと感嘆し、おじいさんへのおみやげに持ち帰ろうとすること",
      "description": "桃を見て、おじいさんへのおみやげに持ち帰ることを決める"
    }
  ]
}
```
{"sentence_id": 5, "text": "「おやおや、これはみごとな桃だこと。おじいさんへのおみやげに、どれどれ、うちへ持って帰りましょう。」", "entities": [{"surface": "おじいさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_ojiisan", "name": "おじいさん"}, {"surface": "桃", "type": "Item", "resolution": "EXISTING", "id": "item_peach", "name": "大きな桃"}, {"surface": "うち", "type": "Location", "resolution": "NEW", "id": "loc_obaasan_house", "name": "おばあさんの家"}], "events": [{"action_type": "COMMUNICATION", "subject": "actor_obaasan", "inference": "補完", "target": null, "location": "loc_river", "destination": null, "item": null, "topic": "桃をみごとなものだと感嘆し、おじいさんへのおみやげに 持ち帰ろうとすること", "description": "桃を見て、おじいさんへのおみやげに持ち帰ることを決める"}]}
[4/10] sentence 5 ok
```json
{
  "entities": [
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "桃",
      "type": "Item",
      "resolution": "EXISTING",
      "id": "item_peach",
      "name": "大きな桃"
    }
  ],
  "events": [
    {
      "action_type": "PHYSICAL_ACTION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": "item_peach",
      "topic": null,
      "description": "腰をかがめて桃を取ろうとする"
    },
    {
      "action_type": "STATE_CHANGE",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": null,
      "topic": null,
      "description": "手が届かない"
    }
  ]
}
```
{"sentence_id": 6, "text": "おばあさんは、そう言いながら、腰をかがめて桃を取ろうとしましたが、遠くって手がとどきません。", "entities": [{"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "桃", "type": "Item", "resolution": "EXISTING", "id": "item_peach", "name": "大きな桃"}], "events": [{"action_type": "PHYSICAL_ACTION", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": "loc_river", "destination": null, "item": "item_peach", "topic": null, "description": "腰をかがめて桃を取ろうとす る"}, {"action_type": "STATE_CHANGE", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": "loc_river", "destination": null, "item": null, "topic": null, "description": "手が届かない"}]}
[5/10] sentence 6 ok
```json
{
  "entities": [
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "そこ",
      "type": "Location",
      "resolution": "UNRESOLVED",
      "id": "loc_river",
      "name": "川"
    }
  ],
  "events": [
    {
      "action_type": "COMMUNICATION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": null,
      "topic": "あっちの水は、かあらいぞ。こっちの水は、ああまいぞ。かあらい水は、よけて来い。ああまい水に、よって来い。",
      "description": "歌を歌う"
    },
    {
      "action_type": "PHYSICAL_ACTION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": "loc_river",
      "destination": null,
      "item": null,
      "topic": null,
      "description": "手をたたく"
    }
  ]
}
```
{"sentence_id": 7, "text": "おばあさんはそこで、「あっちの水は、かあらいぞ。こっちの水は、ああまいぞ。かあらい水は、よけて来い。ああまい水に、よって来い。」と歌いながら、手をたたきました。", "entities": [{"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "そこ", "type": "Location", "resolution": "UNRESOLVED", "id": "loc_river", "name": "川"}], "events": [{"action_type": "COMMUNICATION", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": "loc_river", "destination": null, "item": null, "topic": "あっちの水は、かあらいぞ。こっちの水は、ああまいぞ。かあらい水は、よけて来い。ああまい水に、よって来い。", "description": "歌を歌う"}, {"action_type": "PHYSICAL_ACTION", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": "loc_river", "destination": null, "item": null, "topic": null, "description": "手をたたく"}]}
[6/10] sentence 7 ok
```json
{
  "entities": [
    {
      "surface": "桃",
      "type": "Item",
      "resolution": "EXISTING",
      "id": "item_peach",
      "name": "桃"
    },
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    }
  ],
  "events": [
    {
      "action_type": "MOVEMENT",
      "subject": "item_peach",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": "actor_obaasan",
      "item": null,
      "topic": "ドンブラコッコ、スッコッコ。ドンブラコッコ、スッコッコ。",
      "description": "おばあさんの前へ流れて来る"
    }
  ]
}
```
{"sentence_id": 8, "text": "すると桃はまた、「ドンブラコッコ、スッコッコ。ドンブラコッコ、スッコッコ。」といいながら、おばあさんの前へ流れて来ました。", "entities": [{"surface": "桃", "type": "Item", "resolution": "EXISTING", "id": "item_peach", "name": "桃"}, {"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}], "events": [{"action_type": "MOVEMENT", "subject": "item_peach", "inference": "明示", "target": null, "location": null, "destination": "actor_obaasan", "item": null, "topic": "ドンブラコッコ、スッコッコ。ドンブラコッコ、スッコッコ。", "description": "おばあさんの前へ流れて来る"}]}
[7/10] sentence 8 ok
```json
{
  "entities": [
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "おじいさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_ojiisan",
      "name": "おじいさん"
    },
    {
      "surface": "桃",
      "type": "Item",
      "resolution": "EXISTING",
      "id": "item_peach",
      "name": "桃"
    },
    {
      "surface": "洗濯物",
      "type": "Item",
      "resolution": "NEW",
      "id": "item_laundry",
      "name": "洗濯物"
    },
    {
      "surface": "たらい",
      "type": "Item",
      "resolution": "NEW",
      "id": "item_basin",
      "name": "たらい"
    },
    {
      "surface": "おうち",
      "type": "Location",
      "resolution": "EXISTING",
      "id": "loc_obaasan_house",
      "name": "おばあさんの家"
    }
  ],
  "events": [
    {
      "action_type": "COMMUNICATION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": "actor_ojiisan",
      "location": null,
      "destination": null,
      "item": null,
      "topic": "早くおじいさんと二人で分けて食べましょう。",
      "description": "おじいさんと桃を分けることを提案する"
    },
    {
      "action_type": "PHYSICAL_ACTION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": null,
      "item": "item_peach",
      "topic": null,
      "description": "桃をひろう"
    },
    {
      "action_type": "PHYSICAL_ACTION",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": null,
      "item": "item_laundry",
      "topic": null,
      "description": "洗濯物と桃をたらいに入れる"
    },
    {
      "action_type": "MOVEMENT",
      "subject": "actor_obaasan",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": "loc_obaasan_house",
      "item": "item_peach",
      "topic": null,
      "description": "桃と洗濯物を抱えて家へ帰る"
    }
  ]
}
```
{"sentence_id": 9, "text": "おばあさんはにこにこしながら、「早くおじいさんと二人で分けて食べましょう。」と言って、桃をひろい上げて、洗濯物といっしょにたらいの中に入れて、えっちら、おっちら、かかえておうちへ帰りました。", "entities": [{"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "おじいさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_ojiisan", "name": "おじいさん"}, {"surface": "桃", "type": "Item", "resolution": "EXISTING", "id": "item_peach", "name": "桃"}, {"surface": "洗濯物", "type": "Item", "resolution": "NEW", "id": "item_laundry", "name": "洗濯物"}, {"surface": "たらい", "type": "Item", "resolution": "NEW", "id": "item_basin", "name": "たらい"}, {"surface": "おうち", "type": "Location", "resolution": "EXISTING", "id": "loc_obaasan_house", "name": "おばあさんの家"}], "events": [{"action_type": "COMMUNICATION", "subject": "actor_obaasan", "inference": "明示", "target": "actor_ojiisan", "location": null, "destination": null, "item": null, "topic": "早くおじいさんと二人で分けて食べましょう。", "description": "おじいさんと桃を分けることを提案する"}, {"action_type": "PHYSICAL_ACTION", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": null, "destination": null, "item": "item_peach", "topic": null, "description": "桃をひろう"}, {"action_type": "PHYSICAL_ACTION", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": null, "destination": null, "item": "item_laundry", "topic": null, "description": "洗濯物と桃をたらいに入れる"}, {"action_type": "MOVEMENT", "subject": "actor_obaasan", "inference": "明示", "target": null, "location": null, "destination": "loc_obaasan_house", "item": "item_peach", "topic": null, "description": "桃と洗濯物を抱えて家へ帰る"}]}
[8/10] sentence 9 ok
```json
{
  "entities": [
    {
      "surface": "夕方",
      "type": "Location",
      "resolution": "NEW",
      "id": "time_evening",
      "name": "夕方"
    },
    {
      "surface": "おじいさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_ojiisan",
      "name": "おじいさん"
    },
    {
      "surface": "山",
      "type": "Location",
      "resolution": "EXISTING",
      "id": "loc_mountain",
      "name": "山"
    },
    {
      "surface": "しば",
      "type": "Item",
      "resolution": "NEW",
      "id": "item_firewood",
      "name": "柴"
    }
  ],
  "events": [
    {
      "action_type": "MOVEMENT",
      "subject": "actor_ojiisan",
      "inference": "明示",
      "target": null,
      "location": null,
      "destination": "loc_obaasan_house",
      "item": "item_firewood",
      "topic": null,
      "description": "山から柴を背負って帰宅する"
    }
  ]
}
```
{"sentence_id": 10, "text": "夕方になってやっと、おじいさんは山からしばを背負って帰って来ました。", "entities": [{"surface": "夕方", "type": "Location", "resolution": "NEW", "id": "time_evening", "name": "夕方"}, {"surface": "おじいさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_ojiisan", "name": "おじいさん"}, {"surface": "山", "type": "Location", "resolution": "EXISTING", "id": "loc_mountain", "name": "山"}, {"surface": "しば", "type": "Item", "resolution": "NEW", "id": "item_firewood", "name": "柴"}], "events": [{"action_type": "MOVEMENT", "subject": "actor_ojiisan", "inference": "明示", "target": null, "location": null, "destination": "loc_obaasan_house", "item": "item_firewood", "topic": null, "description": "山から柴を背負って帰宅する"}]}
[9/10] sentence 10 ok
```json
{
  "entities": [
    {
      "surface": "おばあさん",
      "type": "Actor",
      "resolution": "EXISTING",
      "id": "actor_obaasan",
      "name": "おばあさん"
    },
    {
      "surface": "今",
      "type": "Location",
      "resolution": "NEW",
      "id": "time_now",
      "name": "今"
    }
  ],
  "events": [
    {
      "action_type": "COMMUNICATION",
      "subject": "actor_ojiisan",
      "inference": "補完",
      "target": "actor_obaasan",
      "location": null,
      "destination": null,
      "item": null,
      "topic": "今帰ったよ",
      "description": "おじいさんがおばあさんに帰宅を告げる"
    }
  ]
}
```
{"sentence_id": 11, "text": "「おばあさん、今帰ったよ。」", "entities": [{"surface": "おばあさん", "type": "Actor", "resolution": "EXISTING", "id": "actor_obaasan", "name": "おばあさん"}, {"surface": "今", "type": "Location", "resolution": "NEW", "id": "time_now", "name": "今"}], "events": [{"action_type": "COMMUNICATION", "subject": "actor_ojiisan", "inference": "補完", "target": "actor_obaasan", "location": null, "destination": null, "item": null, "topic": "今帰ったよ", "description": "おじいさんがおばあさんに帰宅を告げる"}]}
[10/10] sentence 11 ok
--- ledger ---
- actor_ojiisan [Actor] おじいさん @ loc_obaasan_house
- actor_obaasan [Actor] おばあさん @ loc_obaasan_house
- loc_somewhere [Location] あるところ
- loc_mountain [Location] 山
- loc_river [Location] 川
- item_peach [Item] 大きな桃 @ loc_obaasan_house
- loc_obaasan_house [Location] おばあさんの家
- item_laundry [Item] 洗濯物 @ loc_river
- item_basin [Item] たらい
- time_evening [Location] 夕方
- item_firewood [Item] 柴 @ loc_obaasan_house
- time_now [Location] 今
```
