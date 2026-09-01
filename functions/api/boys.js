// GET /api/boys  -> list all boys
// POST /api/boys -> create a boy

function rowFromBody(body) {
  return {
    name: (body.name || "").trim(),
    age: body.age ? Number(body.age) : null,
    status: body.status || "Available",
    location: body.location || "",
    want_live: body.wantLive || "",
    learn_plan: body.learnPlan || "",
    learn_place: body.learnPlace || "",
    interests: body.interests || "",
    resume_link: body.resumeLink || "",
    mother_phone: body.motherPhone || "",
    character_references: body.references || "",
    notes: body.notes || "",
  };
}

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    "SELECT * FROM boys ORDER BY name ASC"
  ).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  const r = rowFromBody(body);
  if (!r.name) {
    return new Response("Name is required", { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO boys
      (id, name, age, status, location, want_live, learn_plan, learn_place, interests, resume_link, mother_phone, character_references, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      id, r.name, r.age, r.status, r.location, r.want_live, r.learn_plan,
      r.learn_place, r.interests, r.resume_link, r.mother_phone,
      r.character_references, r.notes, now, now
    )
    .run();
  return Response.json({ id });
}
