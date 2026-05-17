# ぴろの友人AI ピット LINE Bot

LINE Messaging API + Vercel 用の最小Webhookです。
最初は固定文で返信します。

## ファイル構成

```text
api/webhook.js
package.json
```

## Vercelに設定する環境変数

```text
LINE_CHANNEL_ACCESS_TOKEN=LINE Developersで発行したChannel access token
```

## Vercelデプロイ後にLINE側へ入れるWebhook URL

```text
https://あなたのVercelプロジェクト名.vercel.app/api/webhook
```

## LINE側でやること

1. LINE Developers ConsoleでChannel access tokenを発行する
2. Vercelの環境変数に `LINE_CHANNEL_ACCESS_TOKEN` を入れる
3. Vercelへこのプロジェクトをデプロイする
4. LINE Official Account ManagerのMessaging API設定にWebhook URLを貼る
5. WebhookをONにする
6. Botにメッセージを送って固定文が返るか確認する

## 注意

この最小版は接続確認用です。
本番運用ではChannel secretを使った署名検証を追加するのがおすすめです。
