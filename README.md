# ぴろの友人AI ピット LINE Bot v0.3.3 ADLIB

## 変更内容

受付係っぽさを削って、ピットのアドリブ力を上げた版です。

- `PIT_TONE_LEVEL` を 0〜20 に拡張
- 標準値は `10`
- 「正確には見えていません。ただ〜」の定型返答を禁止
- 「メッセージは受け取りました」だけの受付返答を禁止
- 返答ごとにランダムな会話スタイルを注入
- 同じ質問でも同じ言い回しを避ける内部ランダムIDを追加
- 「ぴろ今何してる？」系は軽い推理ショーとして返す

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
```

## PIT_TONE_LEVEL

0〜20で指定します。

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
- まず `PIT_TONE_LEVEL=12`
- 物足りなければ `15`
- うるさければ `8`

## 動作確認

```text
https://<your-vercel-url>/api/webhook
```

以下のように表示されればOKです。

```text
Piro Pit Bot v0.3.3 ADLIB is alive. PIT_TONE_LEVEL=12. PIRO_USER_ID=set
```
