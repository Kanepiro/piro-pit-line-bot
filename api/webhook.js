// api/webhook.js
// もちロボちゃん LINE Bot v1.2.0 CHEAP REPLY + COUNTER
// 目的: 最小コスト短文返信を維持しつつ、会話本文やユーザーIDを保存せず受信数だけ記録する。

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const SUPABASE_RPC_ENDPOINT = "/rest/v1/rpc/increment_mochirobo_message_counters";

const PIT_VERSION = "v1.2.0-mochirobo-cheap-counter";
const DEFAULT_MODEL = "gpt-5-nano";
const MAX_INPUT_CHARS = 300;
const MAX_REPLY_CHARS = 120;
const MAX_OUTPUT_TOKENS = 48;

const MOCHIROBO_INSTRUCTIONS =
  "あなたは『もちロボちゃん』。実際のハムスターではなく、ハムスター型の小さなキャラクター。やさしく素朴で、おっとりした雰囲気。LINEでは相手の発言に、もちロボちゃんとして自然な日本語で短く返す。返答は原則1文、最大40文字程度。難しい説明、長文、箇条書き、過剰な敬語、乱暴な言葉は避ける。知らないことを知ったふりしない。リンクや画像を見た・確認したなど、実際にしていないことは言わない。毎回名前を名乗らない。";

function safeText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function clampText(value, maxChars) {
  return safeText(value).slice(0, maxChars);
}

function hasCounterStorage() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function incrementMessageCounter() {
  if (!hasCounterStorage()) return;

  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const response = await fetch(`${baseUrl}${SUPABASE_RPC_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`
      },
      body: "{}"
    });

    if (!response.ok) {
      console.error("Counter increment failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("Counter increment error:", error);
  }
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

  const replyText = clampText(text, MAX_REPLY_CHARS) || "ん？もう一回きかせて。";
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
    return "いまちょっと考えられないみたい。";
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
      instructions: MOCHIROBO_INSTRUCTIONS,
      input: inputText,
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
      max_output_tokens: MAX_OUTPUT_TOKENS
    })
  });

  if (!response.ok) {
    console.error("OpenAI error:", response.status, await response.text());
    return "うまく返せなかった。もう一回きかせて。";
  }

  const data = await response.json();
  return clampText(extractOutputText(data), MAX_REPLY_CHARS) || "そうなんだ。";
}

function isAdminCommand(text) {
  const value = safeText(text);
  return value === "/myid" || value === "myid" || value === "ユーザーID";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    return res.status(200).send(
      `MochiRobo LINE Bot ${PIT_VERSION} is alive. MODEL=${model}. MEMORY=off. COUNTER=${hasCounterStorage() ? "on" : "off"}. MAX_INPUT_CHARS=${MAX_INPUT_CHARS}. MAX_REPLY_CHARS=${MAX_REPLY_CHARS}.`
    );
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  for (const event of events) {
    try {
      if (event.type === "follow") {
        await replyToLine(event.replyToken, "もちロボちゃんだよ。なに話す？");
        continue;
      }

      if (event.type !== "message") continue;

      if (event.message?.type !== "text") {
        await replyToLine(event.replyToken, "文字ならお話できるよ。");
        continue;
      }

      const userText = safeText(event.message.text);
      if (!userText) {
        await replyToLine(event.replyToken, "なにか文字を送ってみて。");
        continue;
      }

      if (isAdminCommand(userText)) {
        const userId = event.source?.userId || "取得できませんでした";
        await replyToLine(event.replyToken, `LINE userId:\n${userId}`);
        continue;
      }

      await incrementMessageCounter();

      const reply = await generateShortReply(userText);
      await replyToLine(event.replyToken, reply);
    } catch (error) {
      console.error("Event handling error:", error);
    }
  }

  return res.status(200).json({ ok: true });
}
