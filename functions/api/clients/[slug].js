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

// DELETE /api/clients/<slug>
export async function onRequestDelete({ request, env, params }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  await env.DB.prepare("DELETE FROM clients WHERE slug = ?1").bind(params.slug).run();
  await env.DB.prepare("DELETE FROM guests WHERE slug = ?1").bind(params.slug).run();
  return json({ ok: true });
}
