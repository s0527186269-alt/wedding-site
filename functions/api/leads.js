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

// GET /api/leads -> list everyone who filled the "want an invitation like this" order form (admin only)
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

  const { results } = await env.DB
    .prepare(
      `SELECT slug, client_name, name, email, phone, event_date, package, payment_method, notes, created_at
       FROM leads ORDER BY created_at DESC`
    )
    .all();

  return json(results);
}
