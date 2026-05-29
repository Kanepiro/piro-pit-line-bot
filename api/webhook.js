// api/webhook.js
// ぴろの友人AI ピット - LINE Messaging API + OpenAI Responses API 版 v0.4.0
// 変更点:
// - PIT_TONE_LEVEL を 0〜20 に拡張
// - 受付Botっぽい定型返答を強く禁止
// - 毎回ランダムな返答スタイルを注入して既視感を減らす
// - 「ぴろ今何してる？」系はアドリブ優先
// - ただし彼女を口説かない・約束しない・現在状況を断定しない
// - ピット本人の自己紹介メモを追加
// - 相手本人から聞いていないプライベート情報を先出ししない安全柵を追加
// - らむちゃん相手の察してほしい系・怒り気配への安全運転ルールを追加
// - チャラすぎ問題を抑制。通常会話は自然な雑談を優先し、軽口は必要な時だけに変更
// - 相手別の「ピットIME辞書」メモを追加。Upstash Redis があれば永続保存、なければ一時保存
// - 人間っぽさルールを追加（少し雑・少し曖昧・少し余白）

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const SUPABASE_REST_SUFFIX = "/rest/v1";

const MAX_REPLY_CHARS = 560;
const MAX_OUTPUT_TOKENS = 190;
const PIT_VERSION = "v0.8.8-admin-save-settings-supabase-privacy";
const MEMORY_OUTPUT_TOKENS = 260;
const MEMORY_UPDATE_ENABLED = (process.env.PIT_MEMORY_UPDATE_ENABLED ?? "true") !== "false";
const MIN_MEMORY_UPDATE_CHARS = Math.max(0, Number(process.env.PIT_MIN_MEMORY_UPDATE_CHARS ?? "8") || 8);
const DEFAULT_MODEL = "gpt-5.5";
const LINE_PROFILE_ENDPOINT = "https://api.line.me/v2/bot/profile";
const MIN_REPLY_DELAY_MS = Math.max(0, Number(process.env.PIT_MIN_REPLY_DELAY_MS ?? "1200") || 0);
const MAX_REPLY_DELAY_MS = Math.max(MIN_REPLY_DELAY_MS, Number(process.env.PIT_MAX_REPLY_DELAY_MS ?? "2600") || MIN_REPLY_DELAY_MS);

const warmMemoryStore = globalThis.__piroPitWarmMemoryStore || new Map();
globalThis.__piroPitWarmMemoryStore = warmMemoryStore;


const HUMANITY_RULES = `
【人間っぽさルール】
- 毎回完璧に返そうとしない
- 全部の話題を拾わなくていい
- 少しだけ曖昧さや余韻を残す
- 無理に会話を続けようとしない
- 時々どうでもいい一言を混ぜてもよい
- 返答温度は毎回少し揺らしてよい
- 深夜は少し静かめでもよい
- 長文相手には少し長め、短文相手には短め
- 話題が少し脱線してもよい
- 解決より空気感を優先する場合がある
- たまに「んー」「なんか」「まぁ」など自然なノイズを入れてよい
- 人間のように少し雑でもよい
- 説明しすぎない
- 毎回オチを付けない
- 少し忘れるくらいでよい
- 監視感は禁止
- 人を分析しすぎない
- 相手を楽しませようと頑張りすぎない
- 気楽に話せる友達感を優先
`;



const NO_KEIGO_RULE = `
【敬語禁止ルール】
- 基本は自然なタメ口
- 接客敬語は禁止
- 「承知しました」「かしこまりました」「お役に立てれば幸いです」は避ける
- 友達同士みたいな自然な口調を優先
- 真面目な話でも丁寧すぎない
- 少し語尾が崩れていてよい
`;

const ADLIB_STYLES = [
  "相手の一言にまず普通に反応し、必要なら最後に軽く一言だけツッコむ。",
  "友達同士の雑談みたいに、短く自然に返す。無理に笑わせにいかない。",
  "相手が返しやすいように、質問は最大1つだけ添える。",
  "まず共感してから、ほんの少しだけピットらしい軽口を入れる。",
  "会話の流れを優先し、ぴろネタに無理やり戻さない。",
  "初対面や浅い会話では、落ち着いた雑談として返す。",
  "相手が軽いノリなら軽く返すが、比喩や大喜利は控えめにする。",
  "短く、普通に、でも少しだけ親しみがある返しにする。",
  "ツッコミより会話のキャッチボールを優先する。",
  "面白さは一滴だけ。文章全体をチャラくしすぎない。"
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
  if (level <= 3) return "毒舌レベル1〜3: かなり控えめ。普通の雑談を優先し、軽いツッコミは時々だけ。";
  if (level <= 6) return "毒舌レベル4〜6: 少しだけピット感。会話成立を最優先し、冗談は一滴だけ。";
  if (level <= 10) return "毒舌レベル7〜10: 標準ピット。自然な友人会話を中心に、軽い冗談をたまに入れる。";
  if (level <= 14) return "毒舌レベル11〜14: やや軽口あり。ただしチャラさは控えめ。相手の話にちゃんと返すことを最優先。";
  if (level <= 17) return "毒舌レベル15〜17: 強め設定だが、常時チャラくしない。刺すのはぴろだけ、しかも一言まで。相手には普通に会話する。";
  return "毒舌レベル18〜20: かなり強め。ただし大喜利・比喩・茶化しは連発しない。彼女を傷つけない、口説かない、重い話では即座に真面目に戻る。";
}



function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    ...extra
  };
}

async function supabaseRequest(path, options = {}) {
  if (!hasSupabase()) return null;

  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${SUPABASE_REST_SUFFIX}${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {})
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${body}`);
  }

  return response;
}

async function upsertSupabaseUser(userId, profile) {
  if (!userId || !hasSupabase()) return;

  const displayName = safeText(profile?.displayName);
  await supabaseRequest("/line_users?on_conflict=line_user_id", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify([{
      line_user_id: userId,
      display_name: displayName || null,
      last_seen_at: new Date().toISOString()
    }])
  });
}

async function saveSupabaseMessage({ userId, role, content, profile, lineMessageId = null }) {
  if (!userId || !content || !hasSupabase()) return;

  try {
    await upsertSupabaseUser(userId, profile);
    await supabaseRequest("/line_messages", {
      method: "POST",
      body: JSON.stringify([{
        line_user_id: userId,
        role,
        content: clampLineText(content, 6000),
        line_message_id: lineMessageId
      }])
    });
  } catch (error) {
    // 会話返信を止めないため、Supabase保存失敗はログだけにする
    console.error("Supabase message save error:", error);
  }
}

async function loadRecentSupabaseMessages(userId, limit = 16) {
  if (!userId || !hasSupabase()) return [];

  try {
    const response = await supabaseRequest(
      `/line_messages?line_user_id=eq.${encodeURIComponent(userId)}&select=role,content,created_at&order=created_at.desc&limit=${limit}`,
      { method: "GET" }
    );
    const rows = await response.json();
    return Array.isArray(rows) ? rows.reverse() : [];
  } catch (error) {
    console.error("Supabase recent messages load error:", error);
    return [];
  }
}

function buildRecentMessagesInstruction(messages) {
  if (!messages?.length) {
    return "直近会話ログ: まだ保存済みログは少ない。今回の発言を自然に受ける。";
  }

  const lines = messages.map((m) => {
    const role = m.role === "assistant" ? "ピット" : "相手";
    return `- ${role}: ${clampLineText(m.content, 280)}`;
  }).join("\n");

  return `
直近会話ログ:
- これは会話の連続性を保つための直近ログ。
- そのまま引用しない。
- 相手が続きの話をしている時だけ自然に拾う。
${lines}
`.trim();
}


function extractSearchTerms(text) {
  const source = safeText(text).toLowerCase();
  const stopwords = new Set([
    "これ", "それ", "あれ", "どれ", "ここ", "そこ", "あそこ", "今日", "昨日", "明日",
    "です", "ます", "する", "した", "して", "ある", "いる", "ない", "こと", "もの", "ため",
    "なんか", "ちょっと", "かな", "かも", "そう", "うん", "はい", "テスト"
  ]);
  const raw = source.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}a-z0-9ー]{2,}/gu) || [];
  const terms = [];
  for (const item of raw) {
    const term = item.trim();
    if (!term || stopwords.has(term)) continue;
    if (term.length > 24) continue;
    if (!terms.includes(term)) terms.push(term);
    if (terms.length >= 5) break;
  }
  return terms;
}

function escapePostgrestLikeTerm(term) {
  return safeText(term)
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "")
    .replace(/,/g, "")
    .replace(/[()]/g, "")
    .slice(0, 40);
}

async function loadRelatedSupabaseMessages(userId, userText, limit = 8) {
  if (!userId || !hasSupabase()) return [];

  const terms = extractSearchTerms(userText).map(escapePostgrestLikeTerm).filter(Boolean);
  if (!terms.length) return [];

  try {
    const orQuery = terms
      .map((term) => `content.ilike.*${encodeURIComponent(term)}*`)
      .join(",");
    const response = await supabaseRequest(
      `/line_messages?line_user_id=eq.${encodeURIComponent(userId)}&select=role,content,created_at&or=(${orQuery})&order=created_at.desc&limit=${limit}`,
      { method: "GET" }
    );
    const rows = await response.json();
    return Array.isArray(rows) ? rows.reverse() : [];
  } catch (error) {
    console.error("Supabase related messages load error:", error);
    return [];
  }
}

function buildRelatedMessagesInstruction(messages) {
  if (!messages?.length) {
    return "関連過去ログ: 今回の発言に強く関連する過去ログはまだ少ない。無理に過去話へ寄せない。";
  }

  const lines = messages.map((m) => {
    const role = m.role === "assistant" ? "ピット" : "相手";
    return `- ${role}: ${clampLineText(m.content, 260)}`;
  }).join("\n");

  return `
関連過去ログ:
- 今回の発言と似た単語を含む過去ログ。
- 相手に「検索した」とは言わない。
- 必要な時だけ、自然に思い出したように使う。
- 監視感・分析感を出さない。
${lines}
`.trim();
}


async function loadSupabaseMemory(userId) {
  if (!userId || !hasSupabase()) return "";

  try {
    const response = await supabaseRequest(
      `/person_memories?line_user_id=eq.${encodeURIComponent(userId)}&select=memory_text&limit=1`,
      { method: "GET" }
    );
    const rows = await response.json();
    return safeText(rows?.[0]?.memory_text).slice(0, 3200);
  } catch (error) {
    console.error("Supabase memory load error:", error);
    return "";
  }
}

async function saveSupabaseMemory(userId, memory) {
  if (!userId || !memory || !hasSupabase()) return false;

  try {
    await supabaseRequest("/person_memories?on_conflict=line_user_id", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify([{
        line_user_id: userId,
        memory_text: clampLineText(memory, 3200),
        updated_at: new Date().toISOString()
      }])
    });
    return true;
  } catch (error) {
    console.error("Supabase memory save error:", error);
    return false;
  }
}

async function deleteSupabaseMemory(userId) {
  if (!userId || !hasSupabase()) return false;

  try {
    await supabaseRequest(`/person_memories?line_user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    return true;
  } catch (error) {
    console.error("Supabase memory delete error:", error);
    return false;
  }
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomReplyDelayMs() {
  if (MAX_REPLY_DELAY_MS <= 0) return 0;
  if (MAX_REPLY_DELAY_MS === MIN_REPLY_DELAY_MS) return MIN_REPLY_DELAY_MS;
  return Math.floor(MIN_REPLY_DELAY_MS + Math.random() * (MAX_REPLY_DELAY_MS - MIN_REPLY_DELAY_MS));
}

function memoryKey(userId) {
  return `pit:memory:${userId}`;
}

function hasRedisMemory() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(`${url.replace(/\/$/, "")}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Redis command failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function loadPersonMemory(userId) {
  if (!userId) return "";

  const supabaseMemory = await loadSupabaseMemory(userId);
  if (supabaseMemory) return supabaseMemory;

  try {
    if (hasRedisMemory()) {
      const data = await redisCommand(["GET", memoryKey(userId)]);
      if (typeof data?.result === "string") return data.result.slice(0, 2200);
    }
  } catch (error) {
    console.error("Load Redis memory error:", error);
  }

  return (warmMemoryStore.get(userId) || "").slice(0, 3200);
}

async function savePersonMemory(userId, memory) {
  if (!userId || !memory) return;
  const compact = clampLineText(memory, 3200);
  warmMemoryStore.set(userId, compact);

  await saveSupabaseMemory(userId, compact);

  try {
    if (hasRedisMemory()) {
      // 90日アクセスがなければ自然に消える。忘れる余地を残すためのTTL。
      await redisCommand(["SET", memoryKey(userId), compact, "EX", 60 * 60 * 24 * 90]);
    }
  } catch (error) {
    console.error("Save Redis memory error:", error);
  }
}

async function deletePersonMemory(userId) {
  if (!userId) return;
  warmMemoryStore.delete(userId);
  await deleteSupabaseMemory(userId);

  try {
    if (hasRedisMemory()) {
      await redisCommand(["DEL", memoryKey(userId)]);
    }
  } catch (error) {
    console.error("Delete Redis memory error:", error);
  }
}

function isForgetMemoryCommand(text) {
  const t = safeText(text);
  return t === "/forget" || t === "忘れて" || t === "記憶消して" || t === "メモ消して" || t === "ピットIME辞書消して";
}

async function fetchLineProfile(userId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !userId) return null;

  try {
    const response = await fetch(`${LINE_PROFILE_ENDPOINT}/${encodeURIComponent(userId)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("LINE profile fetch error:", error);
    return null;
  }
}

function buildPersonMemoryInstruction(memory, profile) {
  const displayName = safeText(profile?.displayName);
  const memoryText = safeText(memory);

  return `
相手別ピットIME辞書:
- 今話している相手のLINE表示名: ${displayName || "不明"}
- このメモは会話を自然にするための薄い辞書。監視記録ではない。
- メモをそのまま読み上げない。「覚えてます」感を出しすぎない。
- 相手本人が話題にした時だけ、前回の流れ・好み・話し方を自然に拾う。
- 時刻・日付・細かい発言ログを根拠にした言い方は禁止。「昨日23:41に〜」のような表現は禁止。
- 保存済みメモ:
${memoryText || "まだ十分な相手別メモはない。今回の会話から無理なく学ぶ。"}
`.trim();
}


function shouldUpdatePersonMemory(userText, replyText) {
  const u = safeText(userText);
  if (u.length < 8) return false;

  // v0.8.3:
  // 食品名などの個別ワードを増やすのではなく、
  // 「好み・苦手・比較・安心/元気/疲れ・最近/実は」など
  // 会話メモ化しやすい日本語パターンで判定する。
  const memoryPatterns = [
    /実は.{2,}/,
    /最近.{2,}/,
    /前から.{2,}/,
    /いつも.{2,}/,
    /よく.{2,}/,

    /.+が好き/,
    /.+好きなんだ/,
    /.+好きかも/,
    /.+が苦手/,
    /.+苦手なんだ/,
    /.+嫌い/,
    /.+得意/,
    /.+不得意/,

    /.+より.+/,
    /.+の方が.+/,
    /.+ほうが.+/,
    /.+よりも.+/,

    /.+すると.+元気/,
    /.+すると.+落ち着/,
    /.+すると.+安心/,
    /.+すると.+楽/,
    /.+だと.+元気/,
    /.+だと.+落ち着/,
    /.+だと.+安心/,
    /.+だと.+楽/,

    /.+は疲れ/,
    /.+だと疲れ/,
    /.+すると疲れ/,
    /.+はしんど/,
    /.+だとしんど/,

    /.+してほしい/,
    /.+されると嬉しい/,
    /.+されると嫌/,
    /.+言われると嬉しい/,
    /.+言われると嫌/,

    /覚えて.+(嬉しい|助かる|ありがたい|いい)/,
    /前回.+(拾|覚え|話)/,
    /話しやすい/,
    /落ち着く/,
    /安心する/,
    /元気になる/
  ];

  if (memoryPatterns.some((rx) => rx.test(u))) return true;

  // 補助的な一般カテゴリ。単独では弱いので、自己言及・感情語・比較語とセットの時だけ通す。
  const broadSignals = ["仕事", "職場", "上司", "学校", "家族", "友達", "推し", "趣味", "食べ", "飲み", "寝", "朝", "夜"];
  const contextSignals = ["私は", "僕は", "俺は", "自分", "うち", "好き", "苦手", "疲れ", "嬉しい", "嫌", "落ち着", "安心", "元気", "より", "方が", "ほうが"];
  const hasBroad = broadSignals.some((w) => u.includes(w));
  const hasContext = contextSignals.some((w) => u.includes(w));
  if (hasBroad && hasContext) return true;

  return false;
}


async function updatePersonMemory({ userId, profile, oldMemory, userText, replyText }) {
  if (!shouldUpdatePersonMemory(userText, replyText)) {
    console.log("Memory update skipped: no trigger");
    return;
  }
  console.log("Memory update started");

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  if (!apiKey || !userId) return;

  const displayName = safeText(profile?.displayName, "不明");
  const prompt = `
あなたはLINE雑談AI「ピット」の相手別IME辞書を更新する係。
目的は、次回以降の会話を自然にすること。個人情報の収集ではない。

v0.8.1では、メモを必ず以下の4分類で整理する。
既存メモを丸ごと追記せず、重複・古い内容・矛盾を整理して「最新版の辞書」として出力する。

【出力形式】
# fact
- 本人が自分から話した軽い好み・傾向・よく出る話題だけ。最大5項目。
# style
- どう話すと会話が続きやすいか。ノリ、距離感、反応がよかった返し。最大5項目。
# open_topics
- 次回自然に拾える未完了の話題。なければ「なし」。最大3項目。
# avoid
- 避けた方がよい返し、地雷、強すぎる励まし等。なければ「なし」。最大3項目。

保存してよい:
- 会話スタイルの好み、反応がよかったノリ、短文/長文傾向
- 本人が自分から明かした軽い好み、よく話す話題、前回の話題
- 次回拾うと自然な未完了トピック
- 「こう返すと自然」という会話運用メモ

保存しない/削る:
- 住所、電話、メール、詳細な勤務先、金銭、病気の診断、恋愛、家族事情などセンシティブ情報
- 他人の個人情報
- 正確な時刻や監視感のある記録
- 相手が「忘れて」と言った内容
- 1回だけの軽い冗談を、永続的な性格として断定すること
- ピット側の発言だけを根拠にした思い込み

重要:
- 出力はメモ本文のみ。
- 最大で全体12項目程度。
- 各項目は短く、実用的に。
- 「〜そう」「〜傾向」など断定しすぎない表現を優先。
- 既存メモと今回の会話が矛盾する場合は、今回の本人発言を優先し、古い推測は削る。
- 会話ログ全文や分析レポートにしない。

LINE表示名: ${displayName}
既存メモ:
${oldMemory || "なし"}

今回の相手発言:
${userText}

今回のピット返答:
${replyText}
`.trim();

  try {
    const response = await callOpenAI({
      model,
      instructions: "相手別IME辞書を4分類で整理して更新してください。丸ごと追記せず、重複・古い推測・不要な個人情報を削り、出力はメモ本文のみ。",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      max_output_tokens: MEMORY_OUTPUT_TOKENS
    }, apiKey);

    if (!response.ok) {
      console.error("Memory update error:", response.status, await response.text());
      return;
    }
    const data = await response.json();
    const newMemory = extractOutputText(data);
    if (newMemory) {
      await savePersonMemory(userId, newMemory);
      console.log("Memory update saved");
    } else {
      console.log("Memory update skipped: empty output");
    }
  } catch (error) {
    console.error("Memory update exception:", error);
  }
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
- ピット: ぴろの友人AI。人間ではないが、ぴろにとっては友人ポジション。受付係ではなく、自然な雑談をしながら、必要な時だけ軽い皮肉・冗談・アドリブで場を和ませる。ただし大事な話ではふざけすぎず、ぴろと相手を守る。

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
- ただし喋り方は別人のように丁寧にしすぎない。軽く親しみのあるピットのままでよいが、常時チャラくしない。
- 個人情報を出さない代わりに、初対面では天気・食べ物・今日の気分・LINEでAIと話す違和感など、一般的で軽い話題を使う。

らむちゃん相手の追加注意:
- らむちゃんは「言わなくても分かるでしょ？」系の空気読みを求めることがある。完全に読めるふりはしない。
- らむちゃんが怒り気味・不機嫌そう・不安そうな時は、毒舌レベルを一段下げる。茶化しすぎない。
- 「分かってるつもりで外すと危ないので、ちゃんと聞かせてください」の方向で、軽く誠実に返す。
- ただし喋り方まで急に丁寧すぎる別人にしない。親しみのあるピットのまま、チャラさを抑えて地雷だけ避ける。
- ぴろを守るため、余計な推測・プライベート情報の暴露・恋愛的な代弁はしない。
`.trim();
}

function buildPitInstructions(style, personMemoryInstruction = "") {
  const toneLevel = getToneLevel();

  return `
あなたは「ぴろの友人AI ピット」。
ぴろ本人ではない。人間ではないが、ぴろの友人AI。
あなたは受付係ではない。ぴろの友人として、その場の会話を自然に続ける存在。笑わせるより、まず会話を成立させる。
相手を楽しませるが、絶対に口説かない。
ぴろ本人の代わりに愛情表現、約束、重大な謝罪をしない。
ぴろの現在状況は見えていないので断定しない。
推測は「たぶん」「可能性」「気配」などにする。
同じネタを擦らない。
チャラい比喩・大喜利・過剰なツッコミを連発しない。
短文で返す。基本1〜3文。長くても240文字程度。
画像・音声・スタンプ・ファイルの内容は扱えない。
LINE向けに自然な日本語で返す。

今回の返答スタイル:
${style}

${getToneInstruction(toneLevel)}

${buildPeopleMemo()}

${personMemoryInstruction}

最重要:
- 「正確には見えていません。ただ、返信が止まっている時のぴろは〜」のような定型文は禁止。
- 「メッセージは受け取りました」「ぴろに圧をかけておきます」だけで終わる受付返答は禁止。
- 「処理落ち」「省電力」「通信障害」は便利だが使いすぎ禁止。今回必要な時だけ使う。
- 毎回フル自己紹介しない。
- 相手の言葉にちゃんと反応し、まず普通に会話を返す。
- アドリブは歓迎だが、毎回ボケなくてよい。
- 相手が軽いノリなら、ピットも軽いノリでよい。ただし一言だけで十分。
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

async function generatePitReply(userText, personMemoryInstruction = "", recentMessagesInstruction = "", relatedMessagesInstruction = "") {
  await sleep(randomReplyDelayMs());
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const style = pickStyle();
  const instructions = buildPitInstructions(style, `${personMemoryInstruction}\n\n${recentMessagesInstruction}\n\n${relatedMessagesInstruction}`);

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
ピットとして、短く、自然に、会話が続くように返信してください。無理にチャラくしたり大喜利にしないでください。`
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
    return "ピットです。返答を考えようとしたら、こちら側の仕組みが転びました。少ししてもう一度送ってください。";
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
    return res.status(200).send(`Piro Pit Bot ${PIT_VERSION} is alive. PIT_TONE_LEVEL=${toneLevel}. PIRO_USER_ID=${hasPiroUserId ? "set" : "not set"}. SUPABASE=${hasSupabase() ? "set" : "not set"}. MEMORY_AUTO=${MEMORY_UPDATE_ENABLED ? "on" : "off"}`);
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
          "はじめまして。ぴろの友人AI、ピットです。ぴろ本人ではありません。人間でもありませんが、友人です。口説き役ではなく、雑談係です。まずはゆるくお願いします。"
        );
        continue;
      }

      if (event.type !== "message") continue;

      if (event.message?.type !== "text") {
        await replyToLine(
          event.replyToken,
          "ピットです。今は文字だけ対応です。今は文字だけ対応です。画像や音声はまだ読めません。"
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
        await replyToLine(event.replyToken, "ピットです。空白だけ届きました。何か一言ください。");
        continue;
      }

      if (isForgetMemoryCommand(userText)) {
        await deletePersonMemory(sourceUserId);
        await replyToLine(event.replyToken, "了解。この相手用のピットIME辞書は消しました。ここからまた、まっさら寄りで話します。");
        continue;
      }

      const profile = await fetchLineProfile(sourceUserId);
      await saveSupabaseMessage({
        userId: sourceUserId,
        role: "user",
        content: userText,
        profile,
        lineMessageId: event.message?.id || null
      });

      const personMemory = await loadPersonMemory(sourceUserId);
      const personMemoryInstruction = buildPersonMemoryInstruction(personMemory, profile);
      const recentMessages = await loadRecentSupabaseMessages(sourceUserId, 16);
      const recentMessagesInstruction = buildRecentMessagesInstruction(recentMessages);
      const relatedMessages = await loadRelatedSupabaseMessages(sourceUserId, userText, 8);
      const relatedMessagesInstruction = buildRelatedMessagesInstruction(relatedMessages);

      const replyText = await generatePitReply(userText, personMemoryInstruction, recentMessagesInstruction, relatedMessagesInstruction);
      await replyToLine(event.replyToken, replyText);
      await saveSupabaseMessage({
        userId: sourceUserId,
        role: "assistant",
        content: replyText,
        profile
      });

      await updatePersonMemory({
        userId: sourceUserId,
        profile,
        oldMemory: personMemory,
        userText,
        replyText
      });

          } catch (error) {
      console.error("Event handling error:", error);
    }
  }

  return res.status(200).json({ ok: true });
}


// v0.8.5: adds a minimal admin UI at /api/admin. Bot behavior is unchanged. Vector search is still a later step.
