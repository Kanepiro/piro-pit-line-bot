# ぴろの友人AI ピット LINE Bot v0.3.2

## 変更内容

「ぴろに渡しとく」と言ってるのに実際は届かない問題を修正しました。

この版では、ぴろ以外の人がピットにメッセージを送ると、ぴろ本人にもPush通知できます。

## 必須環境変数

```text
LINE_CHANNEL_ACCESS_TOKEN=LINEのChannel access token
OPENAI_API_KEY=OpenAIのAPIキー
```

## 追加環境変数

```text
PIRO_USER_ID=ぴろ本人のLINE userId
```

## 任意環境変数

```text
OPENAI_MODEL=gpt-5.5
PIT_TONE_LEVEL=3
```

## ぴろ本人のLINE userIdを調べる方法

1. このv0.3.2をVercelにデプロイ
2. ぴろ本人のLINEからピットに以下のどれかを送る

```text
管理者登録
```

または

```text
/myid
```

3. ピットがuserIdを返す
4. その値をVercelの環境変数 `PIRO_USER_ID` に入れる
5. VercelでRedeploy

## 動作確認

ブラウザで以下を開きます。

```text
https://<your-vercel-url>/api/webhook
```

以下のように表示されればOKです。

```text
Piro Pit Bot v0.3.2 is alive. PIT_TONE_LEVEL=3. PIRO_USER_ID=set
```

`PIRO_USER_ID=not set` の場合は、ぴろへのPush通知はまだ動きません。

## 注意

ぴろへのPush通知はLINEの無料メッセージ枠を消費する可能性があります。
彼女への返信はReplyなのでカウント対象外寄りですが、ぴろへの通知はPushです。
