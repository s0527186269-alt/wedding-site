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

// GET /api/clients -> list every client (used by the admin panel)
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  const { results } = await env.DB
    .prepare("SELECT data FROM clients ORDER BY updated_at DESC")
    .all();
  const clients = results.map((r) => JSON.parse(r.data));
  return json(clients);
}

// POST /api/clients -> create or update one client (upsert by slug)
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);

  let client;
  try {
    client = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const slug = String(client.__slug || "").trim();
  if (!slug) return json({ error: "missing slug" }, 400);

  // אם הכתובת שונתה בפאנל, prevSlug מחזיק את הכתובת שתחתיה השורה נשמרה קודם
  const prev = String(client.__prevSlug || "").trim();
  delete client.__prevSlug;
  delete client.__saved;

  await env.DB.prepare(
    `INSERT INTO clients (slug, name, published, data, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(slug) DO UPDATE SET
       name = ?2, published = ?3, data = ?4, updated_at = ?5`
  )
    .bind(
      slug,
      String(client.__name || ""),
      client.__published ? 1 : 0,
      JSON.stringify(client),
      new Date().toISOString()
    )
    .run();

  if (prev && prev !== slug) {
    // הברכות שכבר התקבלו עוברות לכתובת החדשה, והשורה הישנה נמחקת
    await env.DB.prepare("UPDATE guests SET slug = ?1 WHERE slug = ?2").bind(slug, prev).run();
    await env.DB.prepare("DELETE FROM clients WHERE slug = ?1").bind(prev).run();
  }

  return json({ ok: true, slug });
}
