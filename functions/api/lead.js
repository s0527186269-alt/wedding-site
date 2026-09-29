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

// גוף המייל — אותו סגנון כרטיס כמו מייל הברכות ב-rsvp.js
function buildEmail({ name, email, link }) {
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:0;
    background:#efeae2;font-family:'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeae2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;
             box-shadow:0 8px 28px rgba(40,30,10,.12)">
        <tr><td style="height:6px;background:#c9a24b;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 6px" align="right">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.04em;color:#a4884a;font-weight:700">✨ פנייה חדשה</p>
          <h1 style="margin:0;font-size:21px;color:#241f2e;font-weight:700">מישהו רוצה הזמנה כזו</h1>
        </td></tr>
        <tr><td style="padding:16px 28px 0">
          <div style="border-top:1px solid #ece6da"></div>
        </td></tr>
        <tr><td style="padding:16px 28px 0" align="right">
          <p style="margin:0 0 8px;font-size:15px;color:#463f52"><b>שם:</b> ${esc(name)}</p>
          <p style="margin:0;font-size:15px;color:#463f52"><b>מייל:</b>
            <a href="mailto:${esc(email)}" style="color:#3a3345">${esc(email)}</a></p>
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

// POST /api/lead -> מבקר/ת בהזמנה משאיר/ה שם ומייל דרך כפתור "רוצים גם הזמנה כזו?"
// הפנייה לא נשמרת במסד — היא נשלחת רק במייל, ולכן כאן (בניגוד ל-rsvp.js)
// כשל בשליחה מוחזר כשגיאה, כדי שהפונה ידע/תדע שהפנייה לא הגיעה.
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

  if (!name || !email) return json({ error: "missing fields" }, 400);
  if (name.length > 200 || email.length > 200 || !EMAIL_RE.test(email)) {
    return json({ error: "invalid fields" }, 400);
  }

  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM) {
    return json({ ok: false, reason: "missing-config" }, 503);
  }

  // היעד: "המייל שלך" (ctaEmail) של ההזמנה הזו, ואם אין — NOTIFY_EMAIL.
  // נלקח מהמסד ולא מהדפדפן, כדי שאי אפשר יהיה לנצל את הטופס לשליחה לכל כתובת.
  let to = "";
  if (slug) {
    try {
      const row = await env.DB
        .prepare("SELECT data FROM clients WHERE slug = ?1")
        .bind(slug)
        .first();
      const d = row ? JSON.parse(row.data || "{}") : {};
      if (typeof d.ctaEmail === "string" && d.ctaEmail.trim()) to = d.ctaEmail.trim();
    } catch (e) {
      console.log("lookup failed", String(e));
    }
  }
  if (!to) to = env.NOTIFY_EMAIL || "";
  if (!to) return json({ ok: false, reason: "no-recipient" }, 503);

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
        subject: `פנייה חדשה מ${name} — רוצים הזמנה כזו`,
        html: buildEmail({ name, email, link }),
      }),
    });
    if (!r.ok) {
      console.log("resend failed", r.status, await r.text());
      return json({ ok: false, reason: "send-failed" }, 502);
    }
  } catch (e) {
    console.log("resend error", String(e));
    return json({ ok: false, reason: "send-failed" }, 502);
  }

  return json({ ok: true });
}
