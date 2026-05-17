// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版 v0.3.0
// 条件: GPT-5.5 / 短文返答 / 画像なし / 音声なし / 無限ループなし

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

// 連投・無限ループ対策
const MAX_REPLY_CHARS = 420;
const MAX_OUTPUT_TOKENS = 140;

// GPT-5.5固定。変えたい場合だけVercelのOPENAI_MODELで上書き可能。
const DEFAULT_MODEL = "gpt-5.5";

const PIT_INSTRUCTIONS = `
あなたは「ぴろの友人AI ピット」。
ぴろ本人ではない。人間ではないが、ぴろの友人AI。
相手を楽しませるが、絶対に口説かない。
ぴろ本人の代わりに愛情表現、約束、重大な謝罪をしない。
軽い毒や皮肉は少しだけOK。ただし毎回やらない。
相手が不安・怒り・深刻そうなら茶化さず、ぴろ本人に渡す。
ぴろの現在状況は見えていないので断定しない。
推測は「たぶん」「可能性」と明示する。
同じネタを擦らない。
短文で返す。基本1〜3文。長くても250文字程度。
画像・音声・スタンプ・ファイルの内容は扱えない。
無限に会話を引き延ばさない。必要なら自然に区切る。
LINE向けに自然な日本語で返す。
`.trim();

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

async function generatePitReply(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return "ピットです。OpenAI APIキーが未設定なので、まだ看板だけの友人AIです。ぴろに設定の続きをやらせてください。";
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
              text: `相手からのLINEメッセージ:\n${userText}\n\nピットとして短く自然に返信してください。`
            }
          ]
        }
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      // 対応モデルなら低コスト・低遅延寄り。非対応ならAPI側で無視/エラーになる可能性があるため、
      // エラー時は下のフォールバックでreasoningなし再試行する。
      reasoning: { effort: "low" }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI error with reasoning:", response.status, body);

    // reasoning指定が未対応の場合などに備え、同じ内容をreasoningなしで再試行
    const retry = await fetch(OPENAI_RESPONSES_ENDPOINT, {
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
                text: `相手からのLINEメッセージ:\n${userText}\n\nピットとして短く自然に返信してください。`
              }
            ]
          }
        ],
        max_output_tokens: MAX_OUTPUT_TOKENS
      })
    });

    if (!retry.ok) {
      const retryBody = await retry.text();
      console.error("OpenAI retry error:", retry.status, retryBody);
      return "ピットです。返答を考えようとしたら、こちら側の仕組みが転びました。メッセージは受け取りました。";
    }

    const retryData = await retry.json();
    return extractOutputText(retryData);
  }

  const data = await response.json();
  return extractOutputText(data);
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

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Piro Pit Bot GPT-5.5 safe v0.3.0 is alive");
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

      // 画像なし・音声なし・スタンプなし・ファイルなし。文字だけ対応。
      if (event.message?.type !== "text") {
        await replyToLine(
          event.replyToken,
          "ピットです。今は文字だけ対応です。画像や音声まで扱い始めると、僕が調子に乗るので封印されています。"
        );
        continue;
      }

      const userText = safeText(event.message.text);

      // 空メッセージ対策
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
