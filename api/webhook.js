// api/webhook.js
// ピット LINE Bot v1.0.0 CHEAP REPLY MODE
// 目的: Supabase・記憶・長い人格設定を使わず、最小コストで短文返信する。

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const PIT_VERSION = "v1.0.0-cheap-reply";
const DEFAULT_MODEL = "gpt-5-nano";
const MAX_INPUT_CHARS = 300;
const MAX_REPLY_CHARS = 120;
const MAX_OUTPUT_TOKENS = 48;

function safeText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function clampText(value, maxChars) {
  return safeText(value).slice(0, maxChars);
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content?.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function replyToLine(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!replyToken) throw new Error("Missing LINE replyToken");

  const replyText = clampText(text, MAX_REPLY_CHARS) || "ん？もう一回送って。";
  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: replyText }]
    })
  });

  if (!response.ok) {
    throw new Error(`LINE reply failed: ${response.status} ${await response.text()}`);
  }
}

async function generateShortReply(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return "今ちょっと頭が止まってる。また送って。";
  }

  const inputText = clampText(userText, MAX_INPUT_CHARS);
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions:
        "LINEの短文雑談ボット。相手の発言に自然な日本語で1文だけ返す。最大40文字程度。説明、挨拶の繰り返し、長文、箇条書き、敬語過多は禁止。リンクを開いた・確認したなど事実でないことは言わない。",
      input: inputText,
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
      max_output_tokens: MAX_OUTPUT_TOKENS
    })
  });

  if (!response.ok) {
    console.error("OpenAI error:", response.status, await response.text());
    return "今うまく返せなかった。もう一回どうぞ。";
  }

  const data = await response.json();
  return clampText(extractOutputText(data), MAX_REPLY_CHARS) || "なるほどね。";
}

function isAdminCommand(text) {
  const value = safeText(text);
  return value === "/myid" || value === "myid" || value === "ユーザーID";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    return res.status(200).send(
      `Piro Pit Bot ${PIT_VERSION} is alive. MODEL=${model}. MEMORY=off. SUPABASE=unused. MAX_INPUT_CHARS=${MAX_INPUT_CHARS}. MAX_REPLY_CHARS=${MAX_REPLY_CHARS}.`
    );
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  for (const event of events) {
    try {
      if (event.type === "follow") {
        await replyToLine(event.replyToken, "どうも、ピット。適当に話しかけて。短く返すよ。?");
        continue;
      }

      if (event.type !== "message") continue;

      if (event.message?.type !== "text") {
        await replyToLine(event.replyToken, "文字だけなら返せるよ。");
        continue;
      }

      const userText = safeText(event.message.text);
      if (!userText) {
        await replyToLine(event.replyToken, "何か文字を送って。?");
        continue;
      }

      if (isAdminCommand(userText)) {
        const userId = event.source?.userId || "取得できませんでした";
        await replyToLine(event.replyToken, `LINE userId:\n${userId}`);
        continue;
      }

      const reply = await generateShortReply(userText);
      await replyToLine(event.replyToken, reply);
    } catch (error) {
      console.error("Event handling error:", error);
    }
  }

  return res.status(200).json({ ok: true });
}
