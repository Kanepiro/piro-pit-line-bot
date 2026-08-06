# ピット LINE Bot v1.0.0 CHEAP REPLY MODE

TikTokなどから来る大量の相手へ、OpenAI APIをできるだけ安く使って短文返信する版です。

## この版で削除したもの

- Supabaseへの会話ログ保存
- 相手別メモリ
- 過去ログ検索
- 自動メモリ更新
- Upstash Redis
- 長い人物設定・相談用人格
- 管理画面からのLINE Push送信
- 意図的な返信待ち時間

## 動作

- LINEのテキストメッセージにだけAIで返信
- 標準モデルは `gpt-5-nano`
- 入力は先頭300文字まで
- 返信は原則1文、最大120文字
- OpenAI出力上限は48トークン
- 画像・音声・動画・スタンプには固定の短文で返信し、OpenAI APIを使わない
- 会話履歴を保存せず、毎回その1通だけをOpenAIへ送る

## 必須環境変数

```text
LINE_CHANNEL_ACCESS_TOKEN=LINEのChannel access token
OPENAI_API_KEY=OpenAIのAPIキー
```

## 任意環境変数

```text
OPENAI_MODEL=gpt-5-nano
```

`OPENAI_MODEL` を設定しない場合も `gpt-5-nano` を使用します。

## 不要になった環境変数

以下は残っていても参照しません。Vercelから削除して構いません。

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
PIRO_USER_ID
PIT_MEMORY_UPDATE_ENABLED
PIT_MIN_MEMORY_UPDATE_CHARS
PIT_TONE_LEVEL
PIT_MIN_REPLY_DELAY_MS
PIT_MAX_REPLY_DELAY_MS
```

## URL

Webhook:

```text
https://<your-vercel-url>/api/webhook
```

管理画面:

```text
https://<your-vercel-url>/api/admin
```

Webhookへブラウザでアクセスすると、現在のモデル・文字数上限・稼働状態を確認できます。

## LINE側の通数

相手の発言へ即時返信するReply APIを使用します。管理画面からのPush送信機能は、この版では削除しています。

## コストを抑える仕組み

1. 1メッセージにつきOpenAI APIは1回だけ
2. 記憶更新用の2回目のAPI呼び出しなし
3. 長い人格プロンプトなし
4. 過去ログ・会話履歴の入力なし
5. ユーザー入力を300文字で切る
6. 返答を短文に限定
7. テキスト以外はOpenAIへ送らない

## 注意

公開後は誰でもOpenAI残高を消費できます。OpenAI Platform側の自動補充をオフにし、利用上限も低く設定してから公開してください。
