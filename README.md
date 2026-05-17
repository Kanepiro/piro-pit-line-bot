# ぴろの友人AI ピット LINE Bot - OpenAI連携版

## これは何？

LINE公式アカウント「ぴろの友人AI ピット」に届いたメッセージを、OpenAI APIでピット風に返信するVercel用Webhookです。

OpenAIのResponses APIは、テキスト入力からモデル応答を作るAPIです。

## Vercelに必要な環境変数

### 必須

- `LINE_CHANNEL_ACCESS_TOKEN`
  - LINE Developers の Messaging API 設定で発行する Channel access token

- `OPENAI_API_KEY`
  - OpenAI Platform の API key

### 任意

- `OPENAI_MODEL`
  - 未設定なら `gpt-4.1-mini`

## Webhook URL

VercelにデプロイしたURLの末尾に `/api/webhook` を付けます。

例:

```text
https://piro-pit-line-bot.vercel.app/api/webhook
```

## 動作確認

ブラウザで以下を開く:

```text
https://<your-project>.vercel.app/api/webhook
```

以下が表示されればVercel側は生きています。

```text
Piro Pit Bot with OpenAI is alive
```

## LINE側で確認すること

LINE Developers の Messaging API 設定で:

- Webhook URL を設定
- Webhookの利用を ON
- 検証が成功することを確認

LINE Official Account Manager の応答設定で:

- Webhook: ON
- 応答メッセージ: OFF 推奨
- AI応答メッセージ: OFF 推奨

## ピットの安全ルール

- ぴろ本人ではない
- 人間ではないけど、ぴろの友人AI
- 彼女を口説かない
- 愛情表現や約束をぴろ本人の代わりにしない
- 軽い毒や皮肉はOK
- 重い話は茶化さず本人に渡す
- 同じネタを擦りすぎない
