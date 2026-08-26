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

// GET /api/guests?slug=<slug> -> list guest messages for one invitation (admin only)
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  if (!slug) return json({ error: "missing slug" }, 400);

  const { results } = await env.DB
    .prepare(
      "SELECT name, message, created_at FROM guests WHERE slug = ?1 ORDER BY created_at DESC"
    )
    .bind(slug)
    .all();

  return json(results);
}
