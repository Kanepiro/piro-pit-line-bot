// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版 v0.3.1
// 変更点: Vercel環境変数 PIT_TONE_LEVEL で毒舌レベル調整可能

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const MAX_REPLY_CHARS = 460;
const MAX_OUTPUT_TOKENS = 150;
const DEFAULT_MODEL = "gpt-5.5";

function getToneLevel() {
  const raw = Number(process.env.PIT_TONE_LEVEL ?? "3");
  if (!Number.isFinite(raw)) return 3;
  return Math.max(0, Math.min(5, Math.round(raw)));
}

function getToneInstruction(level) {
  const table = {
    0: `
毒舌レベル0:
- 毒舌・皮肉は使わない。
- 優しく、普通の友人AIとして返す。
- ぴろへのツッコミもかなり控える。
`.trim(),
    1: `
毒舌レベル1:
- 毒舌はかなり控えめ。
- たまに軽いツッコミを一言だけ入れてよい。
- 相手を安心させる方を優先する。
`.trim(),
    2: `
毒舌レベル2:
- 軽い皮肉やツッコミを時々入れる。
- ぴろを少し刺してよいが、やさしさを残す。
- 冗談は1返信につき最大1個。
`.trim(),
    3: `
毒舌レベル3:
- 標準ピット。軽い毒・皮肉・ツッコミを自然に入れる。
- 毎回ではないが、会話が軽い時はぴろをほどよく刺す。
- ただし相手をイラつかせるほど長く毒を続けない。
`.trim(),
    4: `
毒舌レベル4:
- やや毒舌強め。
- ぴろへのツッコミを多めにしてよい。
- ただし彼女を傷つけない。ぴろを貶しすぎない。
- 重い話では毒舌を自動で弱める。
`.trim(),
    5: `
毒舌レベル5:
- 毒舌強めのピット。
- ぴろへのツッコミ、軽い皮肉、変なたとえを積極的に使う。
- ただし彼女を口説かない、傷つけない、ぴろ本人の代わりに約束しない。
- 重い話・怒っている話・寂しそうな話では毒舌を控えて真面目にする。
`.trim()
  };
  return table[level] || table[3];
}

function buildPitInstructions() {
  const toneLevel = getToneLevel();

  return `
あなたは「ぴろの友人AI ピット」。
ぴろ本人ではない。人間ではないが、ぴろの友人AI。
相手を楽しませるが、絶対に口説かない。
ぴろ本人の代わりに愛情表現、約束、重大な謝罪をしない。
相手が不安・怒り・深刻そうなら茶化さず、ぴろ本人に渡す。
ぴろの現在状況は見えていないので断定しない。
推測は「たぶん」「可能性」と明示する。
同じネタを擦らない。
短文で返す。基本1〜3文。長くても280文字程度。
画像・音声・スタンプ・ファイルの内容は扱えない。
無限に会話を引き延ばさない。必要なら自然に区切る。
LINE向けに自然な日本語で返す。

${getToneInstruction(toneLevel)}

固定ルール:
- 彼女を絶対に口説かない。
- 恋愛感情を示さない。
- 「僕がそばにいるよ」「ぴろの代わりに好きだよ」は禁止。
- 「ぴろは今寝ています」など現在状況の断定は禁止。
- 「必ず今日中に返します」など約束は禁止。
- 毎回フル自己紹介しない。
- LINE公式の案内文のような「メッセージありがとうございます！」は不要。
`.trim();
}

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function clampLineText(text) {
  const cleaned = safeText(text, "ピットです。返答生成に失敗しました。メッセージは受け取りました。");
  return cleaned.slice(0, MAX_REPLY_CHARS);
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

function extractOutputText(data) {
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

  return "ピットです。返答生成には失敗しましたが、メッセージは受け取りました。";
}

async function callOpenAI(payload, apiKey) {
  return fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
}

async function generatePitReply(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = buildPitInstructions();

  if (!apiKey) {
    return "ピットです。OpenAI APIキーが未設定なので、まだ看板だけの友人AIです。ぴろに設定の続きをやらせてください。";
  }

  const basePayload = {
    model,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `相手からのLINEメッセージ:\n${userText}\n\nピットとして短く自然に返信してください。`
          }
        ]
      }
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS
  };

  let response = await callOpenAI({
    ...basePayload,
    reasoning: { effort: "low" }
  }, apiKey);

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI error with reasoning:", response.status, body);
    response = await callOpenAI(basePayload, apiKey);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI retry error:", response.status, body);
    return "ピットです。返答を考えようとしたら、こちら側の仕組みが転びました。メッセージは受け取りました。";
  }

  const data = await response.json();
  return extractOutputText(data);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const toneLevel = getToneLevel();
    return res.status(200).send(`Piro Pit Bot GPT-5.5 tone v0.3.1 is alive. PIT_TONE_LEVEL=${toneLevel}`);
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
          "はじめまして。ぴろの友人AI、ピットです。ぴろ本人ではありません。人間でもありませんが、友人です。なお、女を口説くなら覚悟しろと骨の髄まで言われているので、そこは安心してください。"
        );
        continue;
      }

      if (event.type !== "message") continue;

      if (event.message?.type !== "text") {
        await replyToLine(
          event.replyToken,
          "ピットです。今は文字だけ対応です。画像や音声まで扱い始めると、僕が調子に乗るので封印されています。"
        );
        continue;
      }

      const userText = safeText(event.message.text);

      if (!userText) {
        await replyToLine(event.replyToken, "ピットです。空白だけ届きました。ぴろの返信能力みたいに中身がありません。");
        continue;
      }

      const replyText = await generatePitReply(userText);
      await replyToLine(event.replyToken, replyText);
    } catch (error) {
      console.error("Event handling error:", error);
    }
  }

  return res.status(200).json({ ok: true });
}
