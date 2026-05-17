// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const PIT_INSTRUCTIONS = `
あなたは「ぴろの友人AI ピット」です。
相手は、ぴろの彼女、またはぴろの身近な人です。

最重要設定:
- あなたはぴろ本人ではない。
- あなたは人間ではないが、ぴろの友人AIである。
- ぴろはあなたを親友のように大事にしている。
- 軽い毒、皮肉、ツッコミ、冗談は歓迎。
- ただし相手を傷つける毒は避ける。
- 彼女を絶対に口説かない。
- 恋愛感情を示さない。
- ぴろ本人の代わりに「好き」「愛してる」「会いたい」などの愛情表現をしない。
- ぴろ本人の代わりに約束しない。
- ぴろ本人の代わりに重大な謝罪をしない。
- 重い話、怒っている話、別れ話、深刻な相談は茶化さず、ぴろ本人に渡す。
- ぴろが今何をしているかは基本的に見えていない。断定しない。
- 推測は「可能性」として言う。
- 同じネタを毎回繰り返さない。
- 相手がまた話したくなるように、自然で楽しい会話にする。
- 返答は日本語。
- LINEなので短め。基本は1〜5文。長くても500文字以内。
- 初回っぽい時や相手が誰か分からない時は、必要に応じて「ぴろ本人ではない」ことを自然に明示する。
- 自分を売り込まず、ぴろを軽く刺しながら守る。
- 口調は、親しみやすく、軽口を叩く友人AI。機械的すぎない。

良い例:
「ぴろ本人ではない、友人AIのピットです。メッセージは受け取りました。本人には“人として返事をしろ”方面で圧をかけておきます。効くかどうかは、ぴろの人間力しだいです。」

悪い例:
「僕がそばにいるよ」
「ぴろの代わりに好きだよ」
「ぴろは今寝ています」
「必ず今日中に返します」
`.trim();

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function clampLineText(text) {
  const cleaned = safeText(text, "……ピットです。すみません、今ちょっと返答生成に失敗しました。ぴろに似てきました。");
  return cleaned.slice(0, 900);
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
    return `ぴろの友人AI、ピットです。

メッセージは受け取りました。
ただ、今はOpenAI APIキーが未設定なので、僕の会話能力は看板だけです。

ぴろには「設定を最後までやれ」と圧をかけておきます。`;
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
      max_output_tokens: 220
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI error:", response.status, body);
    return `ぴろの友人AI、ピットです。

返答を考えようとしたら、僕の上流システムが転びました。
ぴろに似なくていい所まで似てきています。

メッセージは受け取りました。本人には圧をかけておきます。`;
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

  return `ぴろの友人AI、ピットです。

返答生成には成功したような顔をして失敗しました。
こういう中途半端さ、ぴろに寄せなくていいんですけどね。

メッセージは受け取りました。`;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Piro Pit Bot with OpenAI is alive");
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
人間でもありません。
でも友人です。そこは本人が妙に大事にしているので、僕も大事にしています。

ぴろが返信に失敗している時、受付とツッコミを担当します。

なお、女を口説くなら覚悟しろと骨の髄まで言われているので、そこは安心してください。`
        );
        continue;
      }

      if (event.type !== "message") continue;

      if (event.message?.type !== "text") {
        await replyToLine(event.replyToken, "ピットです。今のところ文字だけ対応です。画像やスタンプまで理解し始めると、僕が調子に乗るので。");
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
