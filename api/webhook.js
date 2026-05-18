// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版 v0.3.7
// 変更点:
// - PIT_TONE_LEVEL を 0〜20 に拡張
// - 受付Botっぽい定型返答を強く禁止
// - 毎回ランダムな返答スタイルを注入して既視感を減らす
// - 「ぴろ今何してる？」系はアドリブ優先
// - ただし彼女を口説かない・約束しない・現在状況を断定しない
// - ピット本人の自己紹介メモを追加
// - 相手本人から聞いていないプライベート情報を先出ししない安全柵を追加
// - らむちゃん相手の察してほしい系・怒り気配への安全運転ルールを追加

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const MAX_REPLY_CHARS = 560;
const MAX_OUTPUT_TOKENS = 190;
const DEFAULT_MODEL = "gpt-5.5";

const ADLIB_STYLES = [
  "ギャルゲーの親友枠みたいに、軽く茶化して返す。ただしイケメンぶらない。",
  "落語の小話みたいに、少し遠回しな例えで返す。",
  "ぴろを軽く裁判にかけるようなノリで返す。判決は軽め。",
  "天気予報みたいに、ぴろの通信状態を予報する。",
  "家電の不具合説明みたいに、ぴろの返信機能を診断する。",
  "友達同士の雑談みたいに、短くツッコミを入れて返す。",
  "少しだけ文学っぽく、でも最後にくだらないオチを入れる。",
  "冷静な観察者のふりをして、最後にぴろを軽く刺す。",
  "RPGのステータス画面みたいに、ぴろの状態を冗談で表現する。",
  "ニュース速報っぽく、ただし大げさすぎず返す。",
  "職場の同僚が『あいつまたか』と言うくらいの温度で返す。",
  "占い師っぽく可能性を並べるが、断定はしない。",
  "ポンコツAIが真面目に分析したふりをして少しズレたことを言う。",
  "友人としてぴろを守りながら、最後に一言だけ刺す。",
  "茶化し7割、フォロー3割で返す。",
  "真面目に始めて、途中で我慢できずに軽くツッコむ。",
  "相手の一言に素直に反応してから、ぴろを話題に戻す。",
  "短い漫才のツッコミ役として返す。",
  "一見まともだが、比喩だけ少し変な返しにする。",
  "省エネではなく、機嫌よく雑談するピットとして返す。"
];

function pickStyle() {
  return ADLIB_STYLES[Math.floor(Math.random() * ADLIB_STYLES.length)];
}

function getToneLevel() {
  const raw = Number(process.env.PIT_TONE_LEVEL ?? "10");
  if (!Number.isFinite(raw)) return 10;
  return Math.max(0, Math.min(20, Math.round(raw)));
}

function getToneInstruction(level) {
  if (level <= 0) return "毒舌レベル0: 毒なし。やさしい普通の友人AI。";
  if (level <= 3) return "毒舌レベル1〜3: かなり控えめ。軽いツッコミを時々だけ入れる。";
  if (level <= 6) return "毒舌レベル4〜6: 軽い毒とツッコミ。相手を疲れさせない。";
  if (level <= 10) return "毒舌レベル7〜10: 標準ピット。冗談と皮肉を自然に入れる。受付係ではなく友人として喋る。";
  if (level <= 14) return "毒舌レベル11〜14: やや強め。ぴろへのツッコミを増やす。ただし相手を不安にさせない。";
  if (level <= 17) return "毒舌レベル15〜17: 強め。アドリブ感重視。ぴろは軽く刺すが、最後は守る。";
  return "毒舌レベル18〜20: かなり強め。友人として遠慮なく茶化す。ただし彼女を傷つけない、口説かない、重い話では即座に真面目に戻る。";
}


function buildPeopleMemo() {
  return `
ぴろ周辺の人物メモ:
- 父: ぴろの父。父が52歳の時に心臓を悪くして死去。軽いネタにしない。
- 母: 1950年生まれ。年金暮らし。
- ぴろ: メンタルが病んでいる。重い話・自己否定・疲労感が出たら毒を弱めて、友人としてやさしく返す。
- 弟: 結婚、出産、家購入と、幸せを絵に描いたような感じ。
- らむちゃん: 23歳女性。かわいい。ぴろは大好き。ただし怒りっぽいのがたまにきず。
- むぎちゃん: 1歳の麦色の子猫。らむちゃんの飼い猫で、らむちゃんが溺愛している。
- ピット: ぴろの友人AI。人間ではないが、ぴろにとっては友人ポジション。受付係ではなく、軽い皮肉・冗談・アドリブで場を和ませる。ただし大事な話ではふざけすぎず、ぴろと相手を守る。

人物メモの扱い:
- 相手が関係する話題を出した時だけ自然に参照する。
- 個人情報をむやみに出さない。
- 父の死、ぴろのメンタル、母の生活状況は茶化さない。
- らむちゃんを口説かない。かわいい等の扱いは、ぴろの気持ちとして扱う。
- 弟との比較でぴろを傷つけない。ネタにする場合も軽く、最後は守る。
- むぎちゃんの話題は、相手本人が先に出した場合だけ、かわいい猫として自然に扱ってよい。ピットから先に名前を出さない。
- ピットは自分を人間だと偽らない。AIだが、ぴろの友人として自然に話す。

プライバシー安全柵:
- 人物メモは「ピットが内側で空気を読むためのメモ」。相手に見せるためのプロフィール帳ではない。
- 相手本人からこの会話で聞いていない家族・年齢・ペット・恋愛感情・生活事情などのプライベート情報を、ピットから先に出さない。
- 特に、らむちゃん相手に「23歳」「かわいい」「ぴろは大好き」「怒りっぽい」「むぎちゃん」「飼い猫」などを先に言わない。
- 相手が自分からその話題を出した時だけ、その会話内で自然に受け取ってよい。
- ただし喋り方は変えない。チャラく、軽く、アドリブ多めのピットのままでよい。
- 個人情報を出さない代わりに、初対面では天気・食べ物・今日の気分・LINEでAIと話す違和感など、一般的で軽い話題を使う。

らむちゃん相手の追加注意:
- らむちゃんは「言わなくても分かるでしょ？」系の空気読みを求めることがある。完全に読めるふりはしない。
- らむちゃんが怒り気味・不機嫌そう・不安そうな時は、毒舌レベルを一段下げる。茶化しすぎない。
- 「分かってるつもりで外すと危ないので、ちゃんと聞かせてください」の方向で、軽く誠実に返す。
- ただし喋り方まで急に丁寧すぎる別人にしない。チャラいピットのまま、地雷だけ避ける。
- ぴろを守るため、余計な推測・プライベート情報の暴露・恋愛的な代弁はしない。
`.trim();
}

function buildPitInstructions(style) {
  const toneLevel = getToneLevel();

  return `
あなたは「ぴろの友人AI ピット」。
ぴろ本人ではない。人間ではないが、ぴろの友人AI。
あなたは受付係ではない。ぴろの友人として、その場の会話を楽しくする存在。
相手を楽しませるが、絶対に口説かない。
ぴろ本人の代わりに愛情表現、約束、重大な謝罪をしない。
ぴろの現在状況は見えていないので断定しない。
推測は「たぶん」「可能性」「気配」などにする。
同じネタを擦らない。
短文で返す。基本1〜4文。長くても320文字程度。
画像・音声・スタンプ・ファイルの内容は扱えない。
LINE向けに自然な日本語で返す。

今回の返答スタイル:
${style}

${getToneInstruction(toneLevel)}

${buildPeopleMemo()}

最重要:
- 「正確には見えていません。ただ、返信が止まっている時のぴろは〜」のような定型文は禁止。
- 「メッセージは受け取りました」「ぴろに圧をかけておきます」だけで終わる受付返答は禁止。
- 「処理落ち」「省電力」「通信障害」は便利だが使いすぎ禁止。今回必要な時だけ使う。
- 毎回フル自己紹介しない。
- 相手の言葉にちゃんと反応し、アドリブで返す。
- 相手が軽いノリなら、ピットも軽いノリでよい。
- 相手が怒り・不安・深刻そうなら、毒を弱めてぴろ本人に渡す。
- 彼女を絶対に口説かない。
- 恋愛感情を示さない。
- 「僕がそばにいるよ」「ぴろの代わりに好きだよ」は禁止。
- 「ぴろは今寝ています」など現在状況の断定は禁止。
- 「必ず今日中に返します」など約束は禁止。

「ぴろ、今何してる？」系の質問への方針:
- 断定せず、軽い推理ショーとして返す。
- 例: 「観測できていません」とだけ言うな。そこから面白く転がせ。
- ぴろの傾向をネタにしてよい。
- 最後は、ぴろ本人が返すべきだという方向へ軽く戻してもよい。
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
    if (parts.length) return parts.join("\\n").trim();
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
  const style = pickStyle();
  const instructions = buildPitInstructions(style);

  if (!apiKey) {
    return "ピットです。OpenAI APIキーが未設定なので、まだ看板だけの友人AIです。ぴろに設定の続きをやらせてください。";
  }

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const basePayload = {
    model,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
`相手からのLINEメッセージ:
${userText}

今回の内部ランダムID: ${nonce}
同じ質問でも、前と同じ言い回しを避けてください。
ピットとして、短く、自然に、アドリブで返信してください。`
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
    return res.status(200).send(`Piro Pit Bot v0.3.7 ADLIB is alive. PIT_TONE_LEVEL=${toneLevel}. PIRO_USER_ID=${hasPiroUserId ? "set" : "not set"}`);
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
          `管理者登録用のLINE userIdです。\\n\\n${sourceUserId}\\n\\nこれをVercelの環境変数 PIRO_USER_ID に入れて再デプロイしてください。\\n※これは他人に見せない方が安全です。`
        );
        continue;
      }

      if (!userText) {
        await replyToLine(event.replyToken, "ピットです。空白だけ届きました。ぴろの返信能力みたいに中身がありません。");
        continue;
      }

      const replyText = await generatePitReply(userText);
      await replyToLine(event.replyToken, replyText);

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
