// GET /f/<slug>/<file> -> מגיש תמונה מתוך R2.
// פתוח לכולם בכוונה: זה מה שאורחי החתונה טוענים כשהם פותחים את ההזמנה.
export async function onRequestGet({ params, env, request }) {
  const key = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!key || !env.MEDIA) return new Response("not found", { status: 404 });

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");

  // SVG הוא מסמך שיכול להריץ קוד. מוגש מאותו דומיין, ולכן חוסמים בו הכל חוץ מהציור עצמו.
  if ((headers.get("content-type") || "").startsWith("image/svg")) {
    headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }

  // אם לדפדפן כבר יש את הקובץ, חוסכים הורדה חוזרת
  if (request.headers.get("if-none-match") === obj.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(obj.body, { headers });
}
