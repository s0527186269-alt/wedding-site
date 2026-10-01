function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// שורת פרטים אחת, מוצגת רק אם יש ערך
const row = (label, value) =>
  value ? `<p style="margin:0 0 8px;font-size:15px;color:#463f52"><b>${esc(label)}:</b> ${esc(value)}</p>` : "";

// גוף המייל — אותו סגנון כרטיס כמו מייל הברכות ב-rsvp.js
function buildEmail({ name, email, phone, eventDate, pkg, paymentMethod, notes, link }) {
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:0;
    background:#efeae2;font-family:'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeae2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;
             box-shadow:0 8px 28px rgba(40,30,10,.12)">
        <tr><td style="height:6px;background:#c9a24b;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 6px" align="right">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.04em;color:#a4884a;font-weight:700">✨ הזמנה חדשה</p>
          <h1 style="margin:0;font-size:21px;color:#241f2e;font-weight:700">מישהו רוצה הזמנה כזו</h1>
        </td></tr>
        <tr><td style="padding:16px 28px 0">
          <div style="border-top:1px solid #ece6da"></div>
        </td></tr>
        <tr><td style="padding:16px 28px 0" align="right">
          ${row("שם", name)}
          <p style="margin:0 0 8px;font-size:15px;color:#463f52"><b>מייל:</b>
            <a href="mailto:${esc(email)}" style="color:#3a3345">${esc(email)}</a></p>
          ${row("טלפון", phone)}
          ${row("תאריך האירוע", eventDate)}
          ${row("חבילה", pkg)}
          ${row("אמצעי תשלום", paymentMethod)}
          ${notes ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#463f52;white-space:pre-wrap">${esc(notes)}</p>` : ""}
        </td></tr>
        ${link ? `<tr><td style="padding:16px 28px 0" align="right">
          <p style="margin:0;font-size:12px;color:#a09aab">נשלח מתוך ההזמנה:
            <a href="${esc(link)}" style="color:#a09aab">${esc(link)}</a></p>
        </td></tr>` : ""}
        <tr><td style="height:26px;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:11px;color:#a79fb3">אפשר פשוט ללחוץ "השב" כדי לענות לפונה</p>
    </td></tr>
  </table>
  </body></html>`;
}

// POST /api/lead -> מבקר/ת בהזמנה ממלא/ה טופס הזמנה דרך כפתור "רוצים גם הזמנה כזו?"
// נשמר תמיד במסד (טבלת leads), ובנוסף נשלח במייל כשאפשר.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // שדה מלכודת לבוטים — מוסתר מבני אדם. אם מולא, מעמידים פנים שהצליח.
  if (String(body.website || "").trim()) return json({ ok: true });

  const slug = String(body.slug || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim().slice(0, 50);
  const eventDate = String(body.eventDate || "").trim().slice(0, 50);
  const pkg = String(body.package || "").trim().slice(0, 200);
  const paymentMethod = String(body.paymentMethod || "").trim().slice(0, 100);
  const notes = String(body.notes || "").trim().slice(0, 2000);

  if (!name || !email) return json({ error: "missing fields" }, 400);
  if (name.length > 200 || email.length > 200 || !EMAIL_RE.test(email)) {
    return json({ error: "invalid fields" }, 400);
  }

  // שם הלקוח שממנו הגיעה הפנייה, ו"המייל שלך" (ctaEmail) כיעד — נלקחים
  // מהמסד ולא מהדפדפן, כדי שלא יהיה אפשר לנצל את הטופס לשליחה לכל כתובת.
  let clientName = "";
  let to = "";
  if (slug) {
    try {
      const clientRow = await env.DB
        .prepare("SELECT name, data FROM clients WHERE slug = ?1")
        .bind(slug)
        .first();
      if (clientRow) {
        clientName = clientRow.name || "";
        const d = JSON.parse(clientRow.data || "{}");
        if (typeof d.ctaEmail === "string" && d.ctaEmail.trim()) to = d.ctaEmail.trim();
      }
    } catch (e) {
      console.log("lookup failed", String(e));
    }
  }
  if (!to) to = env.NOTIFY_EMAIL || "";

  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO leads (slug, client_name, name, email, phone, event_date, package, payment_method, notes, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  )
    .bind(slug, clientName, name, email, phone, eventDate, pkg, paymentMethod, notes, createdAt)
    .run();

  // התראה במייל — אופציונלית. בלי מפתח/שולח/יעד פשוט מדלגים; הפנייה כבר נשמרה.
  if (env.RESEND_API_KEY && env.NOTIFY_FROM && to) {
    const origin = new URL(request.url).origin;
    const link = slug ? `${origin}/i/${encodeURIComponent(slug)}` : "";
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: `הזמנות <${env.NOTIFY_FROM}>`,
          to: [to],
          reply_to: email,
          subject: `הזמנה חדשה מ${name}`,
          html: buildEmail({ name, email, phone, eventDate, pkg, paymentMethod, notes, link }),
        }),
      });
      if (!r.ok) console.log("resend failed", r.status, await r.text());
    } catch (e) {
      console.log("resend error", String(e));
    }
  }

  return json({ ok: true });
}
