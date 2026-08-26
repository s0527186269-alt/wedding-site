function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// POST /api/rsvp -> a guest submits a name + blessing message for a given invitation
export async function onRequestPost({ request, env }) {
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

  return json({ ok: true });
}
