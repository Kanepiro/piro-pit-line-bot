# ぴろの友人AI ピット LINE Bot - OpenAI連携版 v0.2.1

## 変更点

前バージョンは毒舌・定型ネタが強すぎて、話しているとイライラしやすい可能性がありました。

v0.2.1では以下を調整しています。

- 毒舌を毎回入れない
- 冗談は1返信につき最大1個
- 「処理落ち」「省電力」「圧をかける」系の連発を禁止
- ぴろを刺しすぎない
- 相手の感情に合わせて、真面目に返す場面を増やす
- 返答を短めにする
- フル自己紹介を毎回しない

## Vercelに必要な環境変数

- `LINE_CHANNEL_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` 任意。未設定なら `gpt-4.1-mini`

## Webhook URL

```text
https://<your-project>.vercel.app/api/webhook
```

ブラウザで開いて以下が表示されればOKです。

```text
Piro Pit Bot with OpenAI v0.2.1 is alive
```
