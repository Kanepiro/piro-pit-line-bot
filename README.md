# ぴろの友人AI ピット LINE Bot v0.3.0

## 変更内容

この版は以下の条件を入れた安全運用版です。

- GPT-5.5指定
- 短文返答
- 画像なし
- 音声なし
- スタンプ/ファイルなし
- 無限ループなし
- 返答上限を短めに制限
- 毒舌を控えめにして自然会話寄り

## Vercelの環境変数

必須:

```text
LINE_CHANNEL_ACCESS_TOKEN=LINEのChannel access token
OPENAI_API_KEY=OpenAIのAPIキー
```

任意:

```text
OPENAI_MODEL=gpt-5.5
```

このZIPではコード側の初期値が `gpt-5.5` なので、`OPENAI_MODEL` は未設定でもGPT-5.5になります。
別モデルに戻したい場合だけ、Vercelで `OPENAI_MODEL=gpt-4.1-mini` などに変更してください。

## 動作確認

デプロイ後に以下をブラウザで開きます。

```text
https://<your-vercel-url>/api/webhook
```

以下が表示されればOKです。

```text
Piro Pit Bot GPT-5.5 safe v0.3.0 is alive
```

## LINE側

Webhook URLはこれです。

```text
https://<your-vercel-url>/api/webhook
```

LINE Official Account Manager側は以下推奨です。

- Webhook: ON
- 応答メッセージ: OFF
- AI応答メッセージ: OFF
