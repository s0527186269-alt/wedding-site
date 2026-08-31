// GET /f/<slug>/<file> -> מגיש תמונה מתוך R2.
// פתוח לכולם בכוונה: זה מה שאורחי החתונה טוענים כשהם פותחים את ההזמנה.
export async function onRequestGet({ params, env, request }) {
  const key = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!key || !env.MEDIA) return new Response("not found", { status: 404 });

  // נגני אודיו (ובמיוחד ספארי באייפון) מבקשים את הקובץ בחלקים ומצפים לתשובת 206.
  // בלי זה המוזיקה עלולה לא להתנגן כלל, ובוודאי לא לאפשר דילוג באמצע.
  const rangeHeader = request.headers.get("range");
  const obj = await env.MEDIA.get(key, rangeHeader ? { range: request.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("accept-ranges", "bytes");

  // SVG הוא מסמך שיכול להריץ קוד. מוגש מאותו דומיין, ולכן חוסמים בו הכל חוץ מהציור עצמו.
  if ((headers.get("content-type") || "").startsWith("image/svg")) {
    headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }

  // אם לדפדפן כבר יש את הקובץ, חוסכים הורדה חוזרת
  if (!rangeHeader && request.headers.get("if-none-match") === obj.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  // כשהתבקש טווח, מחזירים 206 יחד עם ציון החלק שנשלח מתוך הקובץ המלא
  if (rangeHeader && obj.range) {
    const total = obj.size;
    const start = obj.range.offset ?? 0;
    const length = obj.range.length ?? total - start;
    const end = start + length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${total}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  return new Response(obj.body, { headers });
}
