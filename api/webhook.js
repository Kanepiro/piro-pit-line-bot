// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版 v0.3.2
// 変更点: ぴろへPush通知できるようにした
//
// 追加環境変数:
//   PIRO_USER_ID = ぴろ本人のLINE userId
//
// 自分のuserId確認:
//   ピットに「管理者登録」または「/myid」と送ると、自分のuserIdを返します。
//   その値をVercelの PIRO_USER_ID に入れて再デプロイしてください。

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
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
    0: "毒舌レベル0: 毒舌・皮肉は使わない。優しく、普通の友人AIとして返す。",
    1: "毒舌レベル1: 毒舌はかなり控えめ。たまに軽いツッコミを一言だけ入れてよい。",
    2: "毒舌レベル2: 軽い皮肉やツッコミを時々入れる。ぴろを少し刺してよいが、やさしさを残す。",
    3: "毒舌レベル3: 標準ピット。軽い毒・皮肉・ツッコミを自然に入れる。ただし毎回ではない。",
    4: "毒舌レベル4: やや毒舌強め。ぴろへのツッコミを多めにしてよい。ただし重い話では弱める。",
    5: "毒舌レベル5: 毒舌強め。ぴろへのツッコミ、軽い皮肉、変なたとえを積極的に使う。ただし彼女を傷つけず、重い話では真面目にする。"
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
- 「ぴろに渡す」と言う場合は、実際に通知機能がある前提で言ってよい。
`.trim();
}

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function clampLineText(text, maxChars = MAX_REPLY_CHARS) {
  const cleaned = safeText(text, "ピットです。返答生成に失敗しました。メッセージは受け取りました。");
  return cleaned.slice(0, maxChars);
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

async function pushToPiro(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const piroUserId = process.env.PIRO_USER_ID;

  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!piroUserId) {
    console.log("PIRO_USER_ID is not set. Skip push notification.");
    return;
  }

  const response = await fetch(LINE_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      to: piroUserId,
      messages: [{ type: "text", text: clampLineText(text, 900) }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${body}`);
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

  let response = await callOpenAI({ ...basePayload, reasoning: { effort: "low" } }, apiKey);

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

function isAdminCommand(text) {
  const t = safeText(text);
  return t === "/myid" || t === "myid" || t === "管理者登録" || t === "ユーザーID";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const toneLevel = getToneLevel();
    const hasPiroUserId = Boolean(process.env.PIRO_USER_ID);
    return res.status(200).send(`Piro Pit Bot v0.3.2 is alive. PIT_TONE_LEVEL=${toneLevel}. PIRO_USER_ID=${hasPiroUserId ? "set" : "not set"}`);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const events = req.body?.events || [];

  for (const event of events) {
    try {
      const sourceUserId = event.source?.userId || "";
      const piroUserId = process.env.PIRO_USER_ID || "";

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

      if (isAdminCommand(userText)) {
        await replyToLine(
          event.replyToken,
          `管理者登録用のLINE userIdです。\n\n${sourceUserId}\n\nこれをVercelの環境変数 PIRO_USER_ID に入れて再デプロイしてください。\n※これは他人に見せない方が安全です。`
        );
        continue;
      }

      if (!userText) {
        await replyToLine(event.replyToken, "ピットです。空白だけ届きました。ぴろの返信能力みたいに中身がありません。");
        continue;
      }

      const replyText = await generatePitReply(userText);
      await replyToLine(event.replyToken, replyText);

      // ぴろ本人以外からのメッセージだけ、ぴろへPush通知
      if (piroUserId && sourceUserId && sourceUserId !== piroUserId) {
        const notifyText =
`【ピット通知】
ピット宛にメッセージが来ました。

相手の文:
${clampLineText(userText, 300)}

ピットの返答:
${clampLineText(replyText, 400)}`;

        await pushToPiro(notifyText);
      }
    } catch (error) {
      console.error("Event handling error:", error);
    }
  }

  return res.status(200).json({ ok: true });
}
