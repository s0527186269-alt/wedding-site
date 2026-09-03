function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function authorized(request, env) {
  const key = request.headers.get("X-Admin-Key") || "";
  return Boolean(env.ADMIN_KEY) && key === env.ADMIN_KEY;
}

// GET /api/diag-email -> admin only, checks which env vars the email flow needs are actually set
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  return json({
    BREVO_API_KEY: Boolean(env.BREVO_API_KEY),
    NOTIFY_FROM: Boolean(env.NOTIFY_FROM),
    NOTIFY_EMAIL: Boolean(env.NOTIFY_EMAIL),
  });
}

// POST /api/diag-email { to } -> admin only, sends a real test email and reports Brevo's actual
// response instead of swallowing it (unlike the guest-facing flow in rsvp.js, which fails silently
// on purpose so a broken mail setup never surfaces as an error to a guest).
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const to = String(body.to || "").trim();
  if (!to) return json({ error: "missing to" }, 400);

  if (!env.BREVO_API_KEY || !env.NOTIFY_FROM) {
    return json({ ok: false, reason: "missing-config" });
  }

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "הזמנות", email: env.NOTIFY_FROM },
        to: [{ email: to }],
        subject: "מייל בדיקה — הזמנות",
        htmlContent:
          '<div dir="rtl" style="font-family:sans-serif;padding:16px">' +
          "זהו מייל בדיקה שנשלח מפאנל הניהול. אם הגיע — ההגדרות תקינות.</div>",
      }),
    });
    const detail = await r.text();
    if (!r.ok) return json({ ok: false, reason: "brevo-error", status: r.status, detail });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, reason: "network", detail: String(e) });
  }
}
