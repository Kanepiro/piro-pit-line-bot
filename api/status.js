const PIT_VERSION = "v0.8.4-status-ui-supabase-privacy";

function mask(value) {
  if (!value) return "not set";
  return "set";
}

module.exports = async function handler(req, res) {
  const memoryUpdateEnabled = process.env.PIT_MEMORY_UPDATE_ENABLED !== "false";

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ピット Status</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      padding: 32px;
      background: #f7f7f7;
      color: #222;
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 6px 24px rgba(0,0,0,.08);
    }
    h1 { margin-top: 0; font-size: 24px; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e8f5e9;
      font-size: 13px;
    }
    dl {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 10px 16px;
      margin-top: 20px;
    }
    dt { color: #666; }
    dd { margin: 0; font-weight: 600; word-break: break-all; }
    .note {
      margin-top: 24px;
      color: #666;
      font-size: 14px;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <main>
    <h1>ぴろの友人AI ピット</h1>
    <div class="badge">Status OK</div>

    <dl>
      <dt>Version</dt>
      <dd>${PIT_VERSION}</dd>

      <dt>Supabase URL</dt>
      <dd>${mask(process.env.SUPABASE_URL)}</dd>

      <dt>Supabase Service Key</dt>
      <dd>${mask(process.env.SUPABASE_SERVICE_ROLE_KEY)}</dd>

      <dt>Memory Update</dt>
      <dd>${memoryUpdateEnabled ? "enabled" : "disabled"}</dd>

      <dt>Webhook</dt>
      <dd>/api/webhook</dd>
    </dl>

    <p class="note">
      これは簡易確認用のステータス画面です。秘密鍵の中身は表示しません。
    </p>
  </main>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
};
