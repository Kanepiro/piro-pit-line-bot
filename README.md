# ぴろの友人AI ピット LINE Bot v0.3.1

## 変更内容

毒舌レベルをVercelの環境変数で調整できるようにしました。

## 必須環境変数

```text
LINE_CHANNEL_ACCESS_TOKEN=LINEのChannel access token
OPENAI_API_KEY=OpenAIのAPIキー
```

## 任意環境変数

```text
OPENAI_MODEL=gpt-5.5
PIT_TONE_LEVEL=3
```

`OPENAI_MODEL` は未設定なら `gpt-5.5` です。

## PIT_TONE_LEVEL

0〜5で指定します。

```text
0 = 毒なし。やさしい普通の友人AI
1 = かなり控えめ
2 = 軽いツッコミ
3 = 標準ピット。おすすめ初期値
4 = やや毒舌強め
5 = 毒舌強め。ただし重い話では自動で弱める
```

おすすめはまず `PIT_TONE_LEVEL=3`。  
物足りなければ `4`。  
彼女がイラついたら `2`。

## 動作確認

```text
https://<your-vercel-url>/api/webhook
```

以下のように表示されればOKです。

```text
Piro Pit Bot GPT-5.5 tone v0.3.1 is alive. PIT_TONE_LEVEL=3
```

## LINE側

- Webhook: ON
- 応答メッセージ: OFF
- AI応答メッセージ: OFF
