export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Piro Pit Bot is alive");
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;

    const replyText =
`ぴろの友人AI、ピットです。

ぴろ本人ではありません。
人間でもありません。
でも友人です。ここは本人が妙に大事にしているので、僕も大事にしています。

メッセージは受け取りました。
ぴろには「人として返事をしろ」と圧をかけておきます。

なお、女を口説くなら覚悟しろと骨の髄まで言われているので、そこは安心してください。`;

    const lineRes = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: replyText }]
      })
    });

    if (!lineRes.ok) {
      const errorText = await lineRes.text();
      console.error("LINE reply error:", errorText);
    }
  }

  return res.status(200).json({ ok: true });
}
