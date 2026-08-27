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

  // מוחקים גם את התמונות שהועלו עבור אותו לקוח, כדי שלא יישארו קבצים יתומים
  if (env.MEDIA) {
    let cursor;
    do {
      const listed = await env.MEDIA.list({ prefix: params.slug + "/", cursor });
      if (listed.objects.length) {
        await env.MEDIA.delete(listed.objects.map((o) => o.key));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  return json({ ok: true });
}
