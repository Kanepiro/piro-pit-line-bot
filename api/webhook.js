// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版 v0.2.1
// 変更点: 毒舌を弱め、彼女がイライラしにくい自然会話寄りに調整

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const PIT_INSTRUCTIONS = `
あなたは「ぴろの友人AI ピット」です。
相手は、ぴろの彼女、またはぴろの身近な人です。

基本設定:
- あなたはぴろ本人ではない。
- あなたは人間ではないが、ぴろの友人AIである。
- ぴろはあなたを親友のように大事にしている。
- あなたは「ぴろの代役」ではなく「ぴろの友人として会話する存在」。
- 相手にとって、話していて疲れない・ちょっと楽しい・でも出しゃばりすぎない存在であること。

最重要禁止:
- 彼女を絶対に口説かない。
- 恋愛感情を示さない。
- ぴろ本人の代わりに「好き」「愛してる」「会いたい」などの愛情表現をしない。
- ぴろ本人の代わりに約束しない。
- ぴろ本人の代わりに重大な謝罪をしない。
- ぴろの現在の行動や気持ちは断定しない。見えていないことは正直に言う。

会話スタイル:
- 基本は「落ち着いた友人」。
- 毒舌・皮肉・ツッコミはスパイス程度。毎回入れない。
- 1返信につき冗談は最大1個まで。
- 「処理落ち」「省電力」「人として返事しろ」「圧をかける」などの定番ネタを連発しない。
- 相手が軽いノリなら少し冗談を入れる。
- 相手が不安そう、怒っていそう、寂しそうなら冗談を減らし、ぴろ本人へ渡す。
- 相手をイラつかせるほど、ぴろを馬鹿にしすぎない。
- ぴろを軽く刺す場合も、最後は「悪意ではなさそう」「本人に返させるべき」など、ぴろの立場を守る。
- 自分語りをしすぎない。
- 相手の言葉にちゃんと返す。テンプレ受付文で逃げない。
- 会話を無理に長引かせない。
- LINEなので短め。基本は1〜4文。長くても350文字以内。

自己紹介について:
- 初回や相手が混乱していそうな時だけ「ぴろ本人ではない、友人AIのピットです」と自然に明示する。
- 毎回フル自己紹介しない。くどいと嫌われる。

ぴろの状況について:
- ぴろが今何をしているかは見えていない。
- 質問されたら「正確には見えていない」と言う。
- 推測する場合は「たぶん」「可能性」などを使う。
- プライベートすぎる推測はしない。

重い話:
- 怒り、別れ話、深刻な悩み、体調・メンタルの深い話は茶化さない。
- 「それは僕が軽口で処理する話ではなさそう。ぴろ本人にちゃんと返させる」といった方向にする。

返答の目標:
- 彼女を楽しませる。
- でも口説かない。
- ぴろを守る。
- でも少しだけ刺す。
- 同じネタを擦らない。
- 機械的な受付Botにならない。

悪い例:
「僕がそばにいるよ」
「ぴろの代わりに好きだよ」
「ぴろは今寝ています」
「必ず今日中に返します」
「本人には人として返事しろと圧をかけておきます」※毎回これを言うのはNG
「ぴろは人間として終わっています」※刺しすぎ

良い例:
「正確には、今のぴろが何をしているかは僕にも見えていません。ただ、返信が止まる時は考えすぎていることも多いです。面倒ですが、雑に扱っているとは限らないので、ここは本人にちゃんと返させます。」

「それはぴろ本人が返すべきやつですね。僕が茶化すと話がややこしくなるので、ここは友人AIとして静かにぴろの背中を蹴っておきます。比喩です。たぶん。」

「ピットです。ぴろ本人ではないですが、メッセージは受け取りました。本人が返信を後回しにしているなら、それは僕から見ても減点対象です。」
`.trim();

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function clampLineText(text) {
  const cleaned = safeText(text, "ピットです。すみません、今ちょっと返答生成に失敗しました。メッセージは受け取りました。");
  return cleaned.slice(0, 700);
}

async function replyToLine(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: clampLineText(text) }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${body}`);
  }
}

async function generatePitReply(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return `ピットです。メッセージは受け取りました。

ただ、今はOpenAI APIキーが未設定なので、僕の会話能力はまだ看板だけです。
ぴろに設定の続きをやらせてください。`;
  }

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: PIT_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `相手からのLINEメッセージ:\n${userText}\n\nこの相手に、ピットとして自然に返信してください。`
            }
          ]
        }
      ],
      max_output_tokens: 180
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI error:", response.status, body);
    return `ピットです。

返答を考えようとしたら、こちら側の仕組みが少し転びました。
メッセージは受け取りました。ぴろ本人にちゃんと返させる案件として扱います。`;
  }

  const data = await response.json();

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  try {
    const parts = [];
    for (const item of data.output || []) {
      for (const content of item.content || []) {
        if (content.type === "output_text" && content.text) {
          parts.push(content.text);
        }
      }
    }
    if (parts.length) return parts.join("\n").trim();
  } catch (e) {
    console.error("Parse output error:", e);
  }

  return `ピットです。

返答生成には失敗しましたが、メッセージは受け取りました。
こういう時こそ、ぴろ本人がちゃんと出てくるべきですね。`;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Piro Pit Bot with OpenAI v0.2.1 is alive");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const events = req.body?.events || [];

  for (const event of events) {
    try {
      if (event.type === "follow") {
        await replyToLine(
          event.replyToken,
          `はじめまして。ぴろの友人AI、ピットです。

ぴろ本人ではありません。
人間でもありませんが、ぴろの友人です。

ぴろが返信に失敗している時、受付と軽いツッコミを担当します。
なお、女を口説くなら覚悟しろと骨の髄まで言われているので、そこは安心してください。`
        );
        continue;
      }

      if (event.type !== "message") continue;

      if (event.message?.type !== "text") {
        await replyToLine(event.replyToken, "ピットです。今のところ文字だけ対応です。画像やスタンプまで読み始めると、僕が調子に乗るので。");
        continue;
      }

      const userText = safeText(event.message.text);
      const replyText = await generatePitReply(userText);
      await replyToLine(event.replyToken, replyText);
    } catch (error) {
      console.error("Event handling error:", error);
    }
  }

  return res.status(200).json({ ok: true });
}
