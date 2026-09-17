function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// תאריך קריא בעברית לזמן קבלת הברכה — פורמט ידני (בלי Intl) כדי לא להסתמך
// על תמיכת locale בסביבת ה-Workers.
function fmtReceived(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];
  const p = (n) => String(n).padStart(2, "0");
  return `${days[d.getDay()]}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// גוף המייל — כרטיס מעוצב עם table לפי המקובל בפיתוח מיילים (תאימות רחבה
// יותר מ-div/flex בלקוחות כמו Outlook). עברית, מיושר לימין, וברכה אחת בכל הודעה.
function buildEmail({ clientName, name, message, slug, origin, receivedAt }) {
  const link = origin ? `${origin}/i/${encodeURIComponent(slug)}` : "";
  const when = fmtReceived(receivedAt);
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:0;
    background:#efeae2;font-family:'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeae2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;
             box-shadow:0 8px 28px rgba(40,30,10,.12)">
        <tr><td style="height:6px;background:#c9a24b;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 6px" align="right">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.04em;color:#a4884a;font-weight:700">💌 ברכה חדשה התקבלה</p>
          <h1 style="margin:0;font-size:21px;color:#241f2e;font-weight:700">${esc(clientName)}</h1>
        </td></tr>
        <tr><td style="padding:16px 28px 0">
          <div style="border-top:1px solid #ece6da"></div>
        </td></tr>
        <tr><td style="padding:16px 28px 0" align="right">
          <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#3a3345">${esc(name)}</p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#463f52;white-space:pre-wrap">${esc(message)}</p>
        </td></tr>
        ${when ? `<tr><td style="padding:16px 28px 0" align="right">
          <p style="margin:0;font-size:12px;color:#a09aab">התקבלה ב-${esc(when)}</p>
        </td></tr>` : ""}
        ${link
          ? `<tr><td style="padding:22px 28px 30px" align="center">
              <a href="${esc(link)}" style="display:inline-block;background:#3a3345;color:#ffffff;
                 text-decoration:none;font-size:14px;font-weight:600;padding:11px 26px;border-radius:999px">
                צפייה בהזמנה
              </a>
            </td></tr>`
          : `<tr><td style="height:22px;font-size:0;line-height:0">&nbsp;</td></tr>`}
      </table>
      <p style="margin:18px 0 0;font-size:11px;color:#a79fb3">נשלח אוטומטית ממערכת ההזמנות</p>
    </td></tr>
  </table>
  </body></html>`;
}

// שליחה דרך Resend. נכשלת בשקט בכוונה: הברכה כבר נשמרה במסד,
// ואסור שתקלה בשירות המייל תציג לאורח הודעת שגיאה.
async function notify(env, payload) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // חייבת להיות כתובת מאומתת ב-Resend (דומיין מאומת, או resend.dev לבדיקות)
        from: `הזמנות <${env.NOTIFY_FROM}>`,
        to: [payload.to],
        subject: `ברכה חדשה — ${payload.clientName}`,
        html: buildEmail(payload),
      }),
    });
    if (!r.ok) console.log("resend failed", r.status, await r.text());
  } catch (e) {
    console.log("resend error", String(e));
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

  const receivedAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO guests (slug, name, message, created_at) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(slug, name, message, receivedAt)
    .run();

  // התראה במייל — לגמרי אופציונלית. בלי מפתח, בלי שולח מאומת
  // או בלי כתובת יעד — פשוט מדלגים, והברכה נשמרת כרגיל.
  if (env.RESEND_API_KEY && env.NOTIFY_FROM) {
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
        to, clientName, name, message, slug, receivedAt,
        origin: new URL(request.url).origin,
      }));
    }
  }

  return json({ ok: true });
}
