# ぴろの友人AI ピット LINE Bot v0.4.0 ADLIB+MEMORY

受付係っぽさを削り、自然な雑談と「相手別ピットIME辞書」を追加した版です。

## 主な変更

- `PIT_TONE_LEVEL` は 0〜20
- 標準値は `10`
- 常時ハイテンション、ホスト的な褒め倒し、受付Bot返答を禁止
- 返答ごとにランダムな会話スタイルを注入して既視感を軽減
- 「ぴろ今何してる？」系は断定せず、軽い推理ショーとして返す
- 相手ごとに「ピットIME辞書」メモを作り、次回会話前に読み込む
- `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` があればメモを永続保存
- Redis未設定でも、Vercelの同一インスタンスが生きている間は一時メモとして動作
- 返信前に少しだけランダムな間を入れ、即レス圧を弱める
- `/forget`、`忘れて`、`記憶消して`、`メモ消して`、`ピットIME辞書消して` で相手別メモを削除

## 必須環境変数

```text
LINE_CHANNEL_ACCESS_TOKEN=LINEのChannel access token
OPENAI_API_KEY=OpenAIのAPIキー
```

## 任意環境変数

```text
OPENAI_MODEL=gpt-5.5
PIT_TONE_LEVEL=10
PIRO_USER_ID=ぴろ本人のLINE userId
PIT_MIN_REPLY_DELAY_MS=1200
PIT_MAX_REPLY_DELAY_MS=2600
UPSTASH_REDIS_REST_URL=Upstash Redis REST URL
UPSTASH_REDIS_REST_TOKEN=Upstash Redis REST TOKEN
```

## 相手別ピットIME辞書

このBotは、相手ごとに会話用の短いメモを作ります。
全文ログを毎回読ませるのではなく、次回の雑談に役立つ薄い辞書だけを残します。

保存対象:

```text
- 会話スタイルの好み
- 短文/長文傾向
- 反応がよかったノリ
- 本人が自分から明かした軽い好み
- 前回の未完了トピック
```

保存しない方針:

```text
- 住所、電話、メール、詳細な勤務先
- 金銭、健康、恋愛、家族事情などセンシティブ情報
- 他人の個人情報
- 正確な時刻つきの監視感ある記録
```

Redisを設定しない場合、メモはサーバーが温かい間だけ残ります。安定運用するなら Upstash Redis の設定を推奨します。

## PIT_TONE_LEVEL

```text
0  = 毒なし
3  = かなり控えめ
6  = 軽いツッコミ
10 = 標準ピット
14 = やや毒舌強め
17 = 強め
20 = かなり強め。ただし重い話では真面目に戻る
```

おすすめ:

```text
PIT_TONE_LEVEL=8〜12
```

チャラすぎる場合は `8`、物足りなければ `12` くらいから調整してください。

## 動作確認

```text
https://<your-vercel-url>/api/webhook
```

以下のように表示されればOKです。

```text
Piro Pit Bot v0.4.0 ADLIB+MEMORY is alive. PIT_TONE_LEVEL=10. PIRO_USER_ID=set
```


## v0.5.0 人間っぽさ強化

追加された思想:
- 完璧に返しすぎない
- 少し雑でもよい
- 全部拾わなくてよい
- 無理に盛り上げない
- 少し忘れる
- 間と余韻を大切にする
- 会話を終わらせてもよい

目的:
「面白いAI」ではなく、
「空気が合うAI」を目指す。
