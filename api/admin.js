const PIT_VERSION = "v0.8.7-status-redirect-fix-supabase-privacy";

function envStatus(value) {
  return value ? "設定済み" : "未設定";
}

export default async function handler(req, res) {
  const memoryUpdateEnabled = process.env.PIT_MEMORY_UPDATE_ENABLED !== "false";

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ピット管理画面</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --card: #ffffff;
      --text: #202124;
      --muted: #6b7280;
      --line: #e5e7eb;
      --accent: #111827;
      --ok: #16a34a;
      --warn: #ca8a04;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      max-width: 980px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: .02em;
    }
    .subtitle {
      margin-top: 6px;
      color: var(--muted);
      font-size: 14px;
    }
    .version {
      background: var(--accent);
      color: #fff;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 13px;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 8px 28px rgba(0,0,0,.05);
    }
    .card h2 {
      margin: 0 0 14px;
      font-size: 18px;
    }
    dl {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 10px 12px;
      margin: 0;
    }
    dt { color: var(--muted); }
    dd { margin: 0; font-weight: 650; word-break: break-all; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #166534;
      font-size: 13px;
      font-weight: 650;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ok);
      display: inline-block;
    }
    .control {
      margin: 14px 0;
    }
    .control label {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-weight: 650;
      margin-bottom: 8px;
    }
    .control small {
      color: var(--muted);
      font-weight: 500;
    }
    input[type="range"] {
      width: 100%;
    }
    textarea {
      width: 100%;
      min-height: 150px;
      resize: vertical;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      font: inherit;
      line-height: 1.6;
    }
    .checks {
      display: grid;
      gap: 10px;
    }
    .checks label {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    button {
      border: 0;
      border-radius: 12px;
      background: var(--accent);
      color: white;
      padding: 12px 16px;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: #e5e7eb;
      color: #111827;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .note {
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .full { grid-column: 1 / -1; }
    @media (max-width: 760px) {
      body { padding: 16px; }
      header { display: block; }
      .version { display: inline-block; margin-top: 12px; }
      .grid { grid-template-columns: 1fr; }
      dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>ぴろの友人AI ピット 管理画面</h1>
        <div class="subtitle">性格調整UIの入口。v0.8.5では表示のみ。次版で保存機能をつなぐ。</div>
      </div>
      <div class="version">${PIT_VERSION}</div>
    </header>

    <section class="grid">
      <div class="card">
        <h2>稼働状態</h2>
        <dl>
          <dt>Webhook</dt>
          <dd><span class="pill"><span class="dot"></span>/api/webhook</span></dd>
          <dt>Supabase URL</dt>
          <dd>${envStatus(process.env.SUPABASE_URL)}</dd>
          <dt>Service Role Key</dt>
          <dd>${envStatus(process.env.SUPABASE_SERVICE_ROLE_KEY)}</dd>
          <dt>Memory Update</dt>
          <dd>${memoryUpdateEnabled ? "有効" : "無効"}</dd>
        </dl>
      </div>

      <div class="card">
        <h2>人格プリセット</h2>
        <div class="checks">
          <label><input type="radio" name="preset" checked> ピット標準</label>
          <label><input type="radio" name="preset"> はる｜おはなしAI</label>
          <label><input type="radio" name="preset"> ホストピット</label>
          <label><input type="radio" name="preset"> 執事ピット</label>
        </div>
        <p class="note">ここはまだ見た目だけ。次版でSupabaseの personality_settings に保存予定。</p>
      </div>

      <div class="card">
        <h2>性格スライダー</h2>

        <div class="control">
          <label>優しさ <small id="kindnessValue">80</small></label>
          <input type="range" min="0" max="100" value="80" data-output="kindnessValue">
        </div>

        <div class="control">
          <label>ユーモア <small id="humorValue">70</small></label>
          <input type="range" min="0" max="100" value="70" data-output="humorValue">
        </div>

        <div class="control">
          <label>ツッコミ <small id="tsukkomiValue">55</small></label>
          <input type="range" min="0" max="100" value="55" data-output="tsukkomiValue">
        </div>

        <div class="control">
          <label>毒舌 <small id="dryValue">20</small></label>
          <input type="range" min="0" max="100" value="20" data-output="dryValue">
        </div>

        <div class="control">
          <label>分析 <small id="analysisValue">45</small></label>
          <input type="range" min="0" max="100" value="45" data-output="analysisValue">
        </div>
      </div>

      <div class="card">
        <h2>会話方針</h2>
        <div class="checks">
          <label><input type="checkbox" checked> 前回の話題を自然に拾う</label>
          <label><input type="checkbox" checked> うんうんAI化を防ぐ</label>
          <label><input type="checkbox" checked> 会話を前に進める</label>
          <label><input type="checkbox" checked> 分からないことは調べる前提にする</label>
          <label><input type="checkbox"> ホスト風を強める</label>
          <label><input type="checkbox"> 相談モードを優先する</label>
        </div>
      </div>

      <div class="card full">
        <h2>カスタム性格メモ</h2>
        <textarea>相手を口説かない。
でも、あり得ないほど気遣いができる。
共感だけで終わらず、軽いツッコミや質問で会話を前に進める。
全てを覚えていても、全ては言わない。</textarea>
        <div class="actions">
          <button type="button" onclick="alert('v0.8.5ではまだ保存しません。次版でSupabase保存にします。')">保存（次版予定）</button>
          <button type="button" class="secondary" onclick="location.href='/api/status'">ステータス画面</button>
        </div>
        <p class="note">
          この画面では秘密鍵の中身は表示しません。現時点ではLINEボット本体の挙動は変更していません。
        </p>
      </div>
    </section>
  </main>

  <script>
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      const output = document.getElementById(input.dataset.output);
      const update = () => { output.textContent = input.value; };
      input.addEventListener("input", update);
      update();
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}