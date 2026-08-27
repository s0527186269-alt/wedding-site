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

// סוגי הקבצים המותרים בהעלאה, והסיומת שתישמר עבור כל אחד
const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const MAX_BYTES = 8_000_000;

const clean = (v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

// POST /api/upload?slug=<slug>&field=<field>
// גוף הבקשה הוא הקובץ עצמו (בייטים גולמיים), ו-content-type מציין את סוגו.
// מחזיר { url } — הכתובת שנשמרת בשדה של הלקוח במקום התמונה עצמה.
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  if (!env.MEDIA) return json({ error: "missing R2 binding" }, 500);

  const url = new URL(request.url);
  const slug = clean(url.searchParams.get("slug"));
  const field = clean(url.searchParams.get("field"));
  if (!slug || !field) return json({ error: "missing slug or field" }, 400);

  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  const ext = EXT[type];
  if (!ext) return json({ error: "unsupported type" }, 415);

  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: "empty body" }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: "too large" }, 413);

  const key = `${slug}/${field}-${Date.now().toString(36)}.${ext}`;
  await env.MEDIA.put(key, body, {
    httpMetadata: {
      contentType: type,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return json({ url: "/f/" + key });
}
