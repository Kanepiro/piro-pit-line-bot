const PIT_VERSION = "v1.0.0-cheap-reply";
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const webhookUrl = "/api/webhook";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ピット節約モード</title>
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
    code { background: #f3f4f6; padding: 3px 7px; border-radius: 7px; }
    li { margin: 10px 0; line-height: 1.55; }
  </style>
</head>
<body>
<main>
  <h1>ピット LINE Bot<br>節約モード</h1>
  <p class="sub">記憶・Supabase・管理画面送信を外し、最安モデルで短文返信だけを行います。</p>
  <div class="badge">${escapeHtml(PIT_VERSION)}</div>

  <section class="card">
    <h2>稼働状態</h2>
    <div class="row"><div class="label">Webhook</div><div class="value ok">● ${webhookUrl}</div></div>
    <div class="row"><div class="label">OpenAI API Key</div><div class="value">${envStatus(process.env.OPENAI_API_KEY)}</div></div>
    <div class="row"><div class="label">LINE Access Token</div><div class="value">${envStatus(process.env.LINE_CHANNEL_ACCESS_TOKEN)}</div></div>
    <div class="row"><div class="label">使用モデル</div><div class="value">${escapeHtml(model)}</div></div>
    <div class="row"><div class="label">Supabase</div><div class="value">使用しない</div></div>
    <div class="row"><div class="label">記憶更新</div><div class="value">無効</div></div>
    <div class="row"><div class="label">入力上限</div><div class="value">300文字</div></div>
    <div class="row"><div class="label">返信上限</div><div class="value">120文字／原則1文</div></div>
  </section>

  <section class="card">
    <h2>Vercelで残す環境変数</h2>
    <ul>
      <li><code>LINE_CHANNEL_ACCESS_TOKEN</code></li>
      <li><code>OPENAI_API_KEY</code></li>
      <li><code>OPENAI_MODEL=gpt-5-nano</code>（省略時も同じ）</li>
    </ul>
    <p class="sub">Supabase・Upstash・PIRO_USER_ID・記憶関連の環境変数は、この版では参照しません。</p>
  </section>
</main>
</body>
</html>`);
}
