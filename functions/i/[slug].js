// GET /i/<slug> -> renders the live invitation page for one client
export async function onRequestGet({ params, env, request }) {
  const slug = params.slug;

  const row = await env.DB
    .prepare("SELECT data, published FROM clients WHERE slug = ?1")
    .bind(slug)
    .first();

  if (!row || !row.published) {
    return new Response("ההזמנה לא נמצאה או שעדיין לא פורסמה", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const data = JSON.parse(row.data);
  delete data.__slug;
  delete data.__name;
  delete data.__published;

  const origin = new URL(request.url).origin;
  const tplRes = await fetch(origin + "/hazmana.html");
  let html = await tplRes.text();

  // מזריקים את הנתונים של הלקוח הזה במקום הנתונים ברירת המחדל שבתבנית.
  // הפונקציה כתחליף (ולא מחרוזת) — אחרת תו $ בטקסט של הלקוח יפורש כהוראה מיוחדת.
  const payload = "const data = " + JSON.stringify(data) + ";";
  html = html.replace(/\/\*__DATA_START__\*\/[\s\S]*?\/\*__DATA_END__\*\//, () => payload);

  // מודיעים לדף מה ה-slug שלו, כדי שטופס הברכות ידע לאן לשלוח
  const head = `<script>window.CLIENT_SLUG=${JSON.stringify(slug)};`;
  html = html.replace("<script>", () => head);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
