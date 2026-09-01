// GET /api/matches  -> list all match records
// POST /api/matches -> log a new match

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    "SELECT * FROM matches ORDER BY updated_at DESC"
  ).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.boyId || !body.girlId) {
    return new Response("boyId and girlId are required", { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO matches
      (id, boy_id, boy_name, girl_id, girl_name, status, date_suggested, suggested_by, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      id,
      body.boyId,
      body.boyName || "",
      body.girlId,
      body.girlName || "",
      body.status || "Suggested",
      body.dateSuggested || now.slice(0, 10),
      body.suggestedBy || "",
      body.notes || "",
      now,
      now
    )
    .run();
  return Response.json({ id });
}
