const PIT_VERSION = "v1.2.0-mochirobo-cheap-counter";
const DEFAULT_MODEL = "gpt-5-nano";

function envStatus(value) {
  return value ? "設定済み" : "未設定";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jstKeys() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  const month = `${values.year}-${values.month}`;
  return { dayKey: `day:${day}`, monthKey: `month:${month}` };
}

function hasCounterStorage() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function loadCounters() {
  if (!hasCounterStorage()) {
    return { today: null, month: null, total: null, error: "Supabase未設定" };
  }

  const { dayKey, monthKey } = jstKeys();
  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const wanted = [dayKey, monthKey, "total"];
  const filter = wanted.map((v) => `\"${v}\"`).join(",");

  try {
    const response = await fetch(
      `${baseUrl}/rest/v1/bot_message_counters?select=counter_key,message_count&counter_key=in.(${encodeURIComponent(filter)})`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      return { today: null, month: null, total: null, error: `HTTP ${response.status}` };
    }

    const rows = await response.json();
    const map = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.counter_key, Number(r.message_count) || 0]));
    return {
      today: map.get(dayKey) || 0,
      month: map.get(monthKey) || 0,
      total: map.get("total") || 0,
      error: null
    };
  } catch (error) {
    console.error("Counter load error:", error);
    return { today: null, month: null, total: null, error: "取得失敗" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const webhookUrl = "/api/webhook";
  const counters = await loadCounters();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>もちロボちゃん Bot</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #f5f5f7; color: #202124; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: clamp(28px, 7vw, 46px); line-height: 1.12; margin: 12px 0; }
    .sub { color: #6b7280; line-height: 1.7; }
    .badge { display: inline-block; margin: 8px 0 20px; padding: 11px 18px; border-radius: 999px; background: #111827; color: white; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 24px; padding: 28px; margin: 18px 0; box-shadow: 0 8px 28px rgba(0,0,0,.04); }
    .row { padding: 14px 0; border-bottom: 1px solid #eceff3; }
    .row:last-child { border-bottom: 0; }
    .label { color: #6b7280; margin-bottom: 5px; }
    .value { font-size: 21px; font-weight: 700; word-break: break-all; }
    .ok { color: #15803d; }
    .counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .count { background: #f9fafb; border-radius: 18px; padding: 20px 12px; text-align: center; }
    .count .n { font-size: clamp(30px, 8vw, 44px); font-weight: 800; }
    .count .t { color: #6b7280; margin-top: 6px; }
    code { background: #f3f4f6; padding: 3px 7px; border-radius: 7px; }
    li { margin: 10px 0; line-height: 1.55; }
    @media (max-width: 560px) { .counts { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>もちロボちゃん<br>LINE Bot</h1>
  <p class="sub">短文・低コスト運用。会話本文とLINEユーザーIDは保存せず、受信回数の数字だけ記録します。</p>
  <div class="badge">${escapeHtml(PIT_VERSION)}</div>

  <section class="card">
    <h2>受信回数</h2>
    ${counters.error ? `<p class="sub">カウンター取得: ${escapeHtml(counters.error)}</p>` : ""}
    <div class="counts">
      <div class="count"><div class="n">${counters.today ?? "—"}</div><div class="t">今日</div></div>
      <div class="count"><div class="n">${counters.month ?? "—"}</div><div class="t">今月</div></div>
      <div class="count"><div class="n">${counters.total ?? "—"}</div><div class="t">累計</div></div>
    </div>
    <p class="sub">日本時間基準。通常のテキストメッセージだけを1通=1回として数えます。</p>
  </section>

  <section class="card">
    <h2>稼働状態</h2>
    <div class="row"><div class="label">Webhook</div><div class="value ok">● ${webhookUrl}</div></div>
    <div class="row"><div class="label">OpenAI API Key</div><div class="value">${envStatus(process.env.OPENAI_API_KEY)}</div></div>
    <div class="row"><div class="label">LINE Access Token</div><div class="value">${envStatus(process.env.LINE_CHANNEL_ACCESS_TOKEN)}</div></div>
    <div class="row"><div class="label">使用モデル</div><div class="value">${escapeHtml(model)}</div></div>
    <div class="row"><div class="label">カウンター保存先</div><div class="value">${hasCounterStorage() ? "Supabase（数字のみ）" : "未設定"}</div></div>
    <div class="row"><div class="label">記憶更新</div><div class="value">無効</div></div>
    <div class="row"><div class="label">入力上限</div><div class="value">300文字</div></div>
    <div class="row"><div class="label">返信上限</div><div class="value">120文字／原則1文</div></div>
  </section>
</main>
</body>
</html>`);
}
