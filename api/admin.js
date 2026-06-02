const PIT_VERSION = "v0.9.4-admin-line-push";
const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

function envStatus(value) {
  return value ? "設定済み" : "未設定";
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function clampLineText(text, maxChars = 900) {
  const cleaned = safeText(text);
  return cleaned.slice(0, maxChars);
}

async function pushLineMessage(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const piroUserId = process.env.PIRO_USER_ID;
  const cleanText = clampLineText(text);

  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  if (!piroUserId) throw new Error("PIRO_USER_ID が未設定です。LINEで /myid を送って取得した userId をVercelへ設定してください");
  if (!cleanText) throw new Error("送信する本文が空です");

  const response = await fetch(LINE_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      to: piroUserId,
      messages: [{ type: "text", text: cleanText }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE送信に失敗しました: ${response.status} ${body}`);
  }

  return cleanText;
}

async function saveOutgoingLineMessage(text) {
  const piroUserId = process.env.PIRO_USER_ID;
  if (!piroUserId || !getSupabaseConfig()) return false;

  await supabaseFetch("/line_users?on_conflict=line_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      line_user_id: piroUserId,
      display_name: "ぴろ",
      last_seen_at: new Date().toISOString()
    }])
  });

  await supabaseFetch("/line_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      line_user_id: piroUserId,
      role: "assistant",
      content: clampLineText(text, 6000)
    }])
  });

  return true;
}

async function sendAdminLineMessage(text) {
  const sentText = await pushLineMessage(text);
  let savedToSupabase = false;
  let saveWarning = null;

  try {
    savedToSupabase = await saveOutgoingLineMessage(sentText);
  } catch (error) {
    console.error("Admin sent message save error:", error);
    saveWarning = error?.message || "Supabase保存に失敗しました";
  }

  return { sentText, savedToSupabase, saveWarning };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    restUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    key
  };
}

async function supabaseFetch(path, options = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase env vars are not set");

  const res = await fetch(`${config.restUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!res.ok) {
    const message = typeof json === "object" && json?.message ? json.message : text || `Supabase HTTP ${res.status}`;
    throw new Error(message);
  }

  return json;
}

const defaultSettings = {
  preset: "pit_default",
  kindness: 80,
  humor: 70,
  tsukkomi: 55,
  dry: 20,
  analysis: 45,
  use_recent_topics: true,
  avoid_unun_ai: true,
  move_conversation_forward: true,
  search_when_unsure: true,
  host_mode: false,
  consultation_mode: false,
  custom_memo: "相手を口説かない。\nでも、あり得ないほど気遣いができる。\n共感だけで終わらず、軽いツッコミや質問で会話を前に進める。\n全てを覚えていても、全ては言わない。"
};

function mergeSettings(settings) {
  return { ...defaultSettings, ...(settings || {}) };
}

function numberInRange(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeSettings(input) {
  const base = mergeSettings(input || {});
  return {
    preset: String(base.preset || "pit_default").slice(0, 40),
    kindness: numberInRange(base.kindness, 80),
    humor: numberInRange(base.humor, 70),
    tsukkomi: numberInRange(base.tsukkomi, 55),
    dry: numberInRange(base.dry, 20),
    analysis: numberInRange(base.analysis, 45),
    use_recent_topics: Boolean(base.use_recent_topics),
    avoid_unun_ai: Boolean(base.avoid_unun_ai),
    move_conversation_forward: Boolean(base.move_conversation_forward),
    search_when_unsure: Boolean(base.search_when_unsure),
    host_mode: Boolean(base.host_mode),
    consultation_mode: Boolean(base.consultation_mode),
    custom_memo: String(base.custom_memo || "").slice(0, 2000)
  };
}

async function loadSettings() {
  if (!getSupabaseConfig()) return { settings: defaultSettings, source: "default_no_supabase" };

  try {
    const rows = await supabaseFetch("/personality_settings?id=eq.default&select=settings", {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.settings) {
      return { settings: defaultSettings, source: "default_missing_row" };
    }
    return { settings: mergeSettings(row.settings), source: "supabase" };
  } catch (error) {
    console.error("Load personality settings failed:", error);
    return { settings: defaultSettings, source: "default_load_error" };
  }
}

async function saveSettings(settings) {
  const clean = sanitizeSettings(settings);

  await supabaseFetch("/personality_settings?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: "default",
      settings: clean,
      updated_at: new Date().toISOString()
    })
  });

  return clean;
}

function checked(value) {
  return value ? "checked" : "";
}

function selected(value, expected) {
  return value === expected ? "checked" : "";
}

function htmlPage(settings, source) {
  const memoryUpdateEnabled = process.env.PIT_MEMORY_UPDATE_ENABLED !== "false";

  return `<!doctype html>
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
      --danger: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main { max-width: 980px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    h1 { margin: 0; font-size: 28px; letter-spacing: .02em; }
    .subtitle { margin-top: 6px; color: var(--muted); font-size: 14px; }
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
    .card h2 { margin: 0 0 14px; font-size: 18px; }
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
    .control { margin: 14px 0; }
    .control label {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-weight: 650;
      margin-bottom: 8px;
    }
    .control small { color: var(--muted); font-weight: 500; }
    input[type="range"] { width: 100%; }
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
    .checks { display: grid; gap: 10px; }
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
    button.secondary { background: #e5e7eb; color: #111827; }
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
    .message {
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #eef2ff;
      color: #3730a3;
      display: none;
      font-weight: 650;
    }
    .message.error {
      background: #fee2e2;
      color: #991b1b;
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
        <div class="subtitle">性格設定の保存と、管理画面からのLINE送信ができます。</div>
      </div>
      <div class="version">${PIT_VERSION}</div>
    </header>

    <div id="message" class="message"></div>

    <form id="settingsForm">
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
            <dt>LINE Access Token</dt>
            <dd>${envStatus(process.env.LINE_CHANNEL_ACCESS_TOKEN)}</dd>
            <dt>Push送信先 PIRO_USER_ID</dt>
            <dd>${envStatus(process.env.PIRO_USER_ID)}</dd>
            <dt>Memory Update</dt>
            <dd>${memoryUpdateEnabled ? "有効" : "無効"}</dd>
            <dt>Settings Source</dt>
            <dd>${source}</dd>
            <dt>Personality Apply</dt>
            <dd>LINE反映あり／プリセット反映あり</dd>
          </dl>
        </div>

        <div class="card">
          <h2>人格プリセット</h2>
          <div class="checks">
            <label><input type="radio" name="preset" value="pit_default" ${selected(settings.preset, "pit_default")}> ピット標準</label>
            <label><input type="radio" name="preset" value="haru" ${selected(settings.preset, "haru")}> はる｜おはなしAI</label>
            <label><input type="radio" name="preset" value="host_pit" ${selected(settings.preset, "host_pit")}> ホストピット</label>
            <label><input type="radio" name="preset" value="butler_pit" ${selected(settings.preset, "butler_pit")}> 執事ピット</label>
          </div>
          <p class="note">保存した設定はLINE会話にも反映されます。</p>
        </div>

        <div class="card">
          <h2>性格スライダー</h2>

          <div class="control">
            <label>優しさ <small id="kindnessValue">${settings.kindness}</small></label>
            <input name="kindness" type="range" min="0" max="100" value="${settings.kindness}" data-output="kindnessValue">
          </div>

          <div class="control">
            <label>ユーモア <small id="humorValue">${settings.humor}</small></label>
            <input name="humor" type="range" min="0" max="100" value="${settings.humor}" data-output="humorValue">
          </div>

          <div class="control">
            <label>ツッコミ <small id="tsukkomiValue">${settings.tsukkomi}</small></label>
            <input name="tsukkomi" type="range" min="0" max="100" value="${settings.tsukkomi}" data-output="tsukkomiValue">
          </div>

          <div class="control">
            <label>毒舌 <small id="dryValue">${settings.dry}</small></label>
            <input name="dry" type="range" min="0" max="100" value="${settings.dry}" data-output="dryValue">
          </div>

          <div class="control">
            <label>分析 <small id="analysisValue">${settings.analysis}</small></label>
            <input name="analysis" type="range" min="0" max="100" value="${settings.analysis}" data-output="analysisValue">
          </div>
        </div>

        <div class="card">
          <h2>会話方針</h2>
          <div class="checks">
            <label><input type="checkbox" name="use_recent_topics" ${checked(settings.use_recent_topics)}> 前回の話題を自然に拾う</label>
            <label><input type="checkbox" name="avoid_unun_ai" ${checked(settings.avoid_unun_ai)}> うんうんAI化を防ぐ</label>
            <label><input type="checkbox" name="move_conversation_forward" ${checked(settings.move_conversation_forward)}> 会話を前に進める</label>
            <label><input type="checkbox" name="search_when_unsure" ${checked(settings.search_when_unsure)}> 分からないことは調べる前提にする</label>
            <label><input type="checkbox" name="host_mode" ${checked(settings.host_mode)}> ホスト風を強める</label>
            <label><input type="checkbox" name="consultation_mode" ${checked(settings.consultation_mode)}> 相談モードを優先する</label>
          </div>
        </div>

        <div class="card full">
          <h2>カスタム性格メモ</h2>
          <textarea name="custom_memo">${String(settings.custom_memo || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</textarea>
          <div class="actions">
            <button type="submit">保存</button>
            <button type="button" class="secondary" onclick="location.reload()">再読み込み</button>
          </div>
          <p class="note">
            秘密鍵の中身は表示しません。この画面で保存した設定はSupabaseに入り、LINEボットの返答にも反映されます。
          </p>
        </div>

        <div class="card full">
          <h2>はるからLINE送信</h2>
          <textarea id="linePushText" maxlength="900" placeholder="ここに送信したい本文を入力"></textarea>
          <div class="actions">
            <button type="button" id="sendLineButton">LINEへ送信</button>
            <button type="button" class="secondary" id="clearLineButton">入力欄を空にする</button>
          </div>
          <p class="note">
            送信先はVercel環境変数 <code>PIRO_USER_ID</code> に設定されたLINEユーザーです。送信した本文は、そのままLINEに届きます。Supabaseが設定済みなら会話ログにも assistant として保存します。管理画面URLが他人に見えると勝手に送信されるので、URLは外に出さないでください。
          </p>
        </div>
      </section>
    </form>
  </main>

  <script>
    const message = document.getElementById("message");

    function showMessage(text, isError = false) {
      message.textContent = text;
      message.className = isError ? "message error" : "message";
      message.style.display = "block";
    }

    document.querySelectorAll('input[type="range"]').forEach((input) => {
      const output = document.getElementById(input.dataset.output);
      const update = () => { output.textContent = input.value; };
      input.addEventListener("input", update);
      update();
    });

    document.getElementById("settingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);

      const payload = {
        preset: data.get("preset"),
        kindness: Number(data.get("kindness")),
        humor: Number(data.get("humor")),
        tsukkomi: Number(data.get("tsukkomi")),
        dry: Number(data.get("dry")),
        analysis: Number(data.get("analysis")),
        use_recent_topics: data.has("use_recent_topics"),
        avoid_unun_ai: data.has("avoid_unun_ai"),
        move_conversation_forward: data.has("move_conversation_forward"),
        search_when_unsure: data.has("search_when_unsure"),
        host_mode: data.has("host_mode"),
        consultation_mode: data.has("consultation_mode"),
        custom_memo: data.get("custom_memo") || ""
      };

      try {
        showMessage("保存中...");
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "保存に失敗しました");
        showMessage("保存しました。LINE会話にも反映されます。");
      } catch (error) {
        showMessage(error.message || "保存に失敗しました", true);
      }
    });

    document.getElementById("sendLineButton").addEventListener("click", async () => {
      const textarea = document.getElementById("linePushText");
      const text = textarea.value.trim();

      if (!text) {
        showMessage("送信する本文を入力してください。", true);
        return;
      }

      try {
        showMessage("LINEへ送信中...");
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send_line_message", text })
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "LINE送信に失敗しました");
        textarea.value = "";
        showMessage(json.saveWarning ? "LINEへ送信しました。ただし会話ログ保存は失敗しました: " + json.saveWarning : "LINEへ送信しました。");
      } catch (error) {
        showMessage(error.message || "LINE送信に失敗しました", true);
      }
    });

    document.getElementById("clearLineButton").addEventListener("click", () => {
      document.getElementById("linePushText").value = "";
    });
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        body = JSON.parse(body || "{}");
      }

      if (body?.action === "send_line_message") {
        const result = await sendAdminLineMessage(body.text || "");
        return jsonResponse(res, 200, {
          ok: true,
          sent: true,
          chars: result.sentText.length,
          savedToSupabase: result.savedToSupabase,
          saveWarning: result.saveWarning
        });
      }

      const saved = await saveSettings(body || {});
      return jsonResponse(res, 200, { ok: true, settings: saved });
    }

    const { settings, source } = await loadSettings();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.statusCode = 200;
    res.end(htmlPage(sanitizeSettings(settings), source));
  } catch (error) {
    console.error("Admin UI error:", error);
    return jsonResponse(res, 500, { ok: false, error: error?.message || "Internal Server Error" });
  }
}
