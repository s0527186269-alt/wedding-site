function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// גוף המייל. עברית, מיושר לימין, וברכה אחת בכל הודעה.
function buildEmail({ clientName, name, message, slug, origin }) {
  const link = origin ? `${origin}/i/${encodeURIComponent(slug)}` : "";
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:24px;
    background:#f6f4f0;font:16px/1.6 'Segoe UI',system-ui,sans-serif;color:#1c1a24">
  <div style="max-width:34rem;margin:0 auto;background:#fff;border:1px solid #e2ddea;
       border-radius:8px;padding:20px 22px">
    <p style="margin:0 0 4px;font-size:13px;color:#7a7488">ברכה חדשה</p>
    <h1 style="margin:0 0 16px;font-size:19px">${esc(clientName)}</h1>
    <p style="margin:0 0 6px;font-weight:600">${esc(name)}</p>
    <p style="margin:0;white-space:pre-wrap">${esc(message)}</p>
    ${link ? `<p style="margin:18px 0 0;font-size:13px">
      <a href="${esc(link)}" style="color:#6b5bb0">צפייה בהזמנה</a></p>` : ""}
  </div></body></html>`;
}

// שליחה דרך Brevo. נכשלת בשקט בכוונה: הברכה כבר נשמרה במסד,
// ואסור שתקלה בשירות המייל תציג לאורח הודעת שגיאה.
async function notify(env, payload) {
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        // חייבת להיות כתובת מאומתת ב-Brevo (אימות בקוד בן 6 ספרות, בלי דומיין)
        sender: { name: "הזמנות", email: env.NOTIFY_FROM },
        to: [{ email: payload.to }],
        subject: `ברכה חדשה — ${payload.clientName}`,
        htmlContent: buildEmail(payload),
      }),
    });
    if (!r.ok) console.log("brevo failed", r.status, await r.text());
  } catch (e) {
    console.log("brevo error", String(e));
  }
}

// POST /api/rsvp -> a guest submits a name + blessing message for a given invitation
export async function onRequestPost(context) {
  const { request, env } = context;
  const later = typeof context.waitUntil === "function"
    ? context.waitUntil.bind(context)
    : (p) => p;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const slug = String(body.slug || "").trim();
  const name = String(body.name || "").trim();
  const message = String(body.message || "").trim();

  if (!slug || !name || !message) return json({ error: "missing fields" }, 400);
  if (name.length > 200 || message.length > 4000) return json({ error: "too long" }, 400);

  await env.DB.prepare(
    "INSERT INTO guests (slug, name, message, created_at) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(slug, name, message, new Date().toISOString())
    .run();

  // התראה במייל — לגמרי אופציונלית. בלי מפתח, בלי שולח מאומת
  // או בלי כתובת יעד — פשוט מדלגים, והברכה נשמרת כרגיל.
  if (env.BREVO_API_KEY && env.NOTIFY_FROM) {
    let clientName = slug;
    let to = env.NOTIFY_EMAIL;
    try {
      const row = await env.DB
        .prepare("SELECT name, data FROM clients WHERE slug = ?1")
        .bind(slug)
        .first();
      if (row) {
        clientName = row.name || slug;
        // כתובת ספציפית ללקוח גוברת על ברירת המחדל שבמשתני הסביבה
        const d = JSON.parse(row.data || "{}");
        if (typeof d.notifyEmail === "string" && d.notifyEmail.trim()) {
          to = d.notifyEmail.trim();
        }
      }
    } catch (e) {
      console.log("lookup failed", String(e));
    }
    if (to) {
      later(notify(env, {
        to, clientName, name, message, slug,
        origin: new URL(request.url).origin,
      }));
    }
  }

  return json({ ok: true });
}
