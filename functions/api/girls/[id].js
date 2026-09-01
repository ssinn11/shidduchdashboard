// PUT /api/girls/:id    -> update a girl
// DELETE /api/girls/:id -> delete a girl

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

export async function onRequestPut(context) {
  const body = await context.request.json();
  const r = rowFromBody(body);
  if (!r.name) {
    return new Response("Name is required", { status: 400 });
  }
  const now = new Date().toISOString();
  await context.env.DB.prepare(
    `UPDATE girls SET
      name=?, age=?, status=?, location=?, want_live=?, learn_plan=?, learn_place=?,
      interests=?, resume_link=?, mother_phone=?, character_references=?, notes=?, updated_at=?
     WHERE id=?`
  )
    .bind(
      r.name, r.age, r.status, r.location, r.want_live, r.learn_plan,
      r.learn_place, r.interests, r.resume_link, r.mother_phone,
      r.character_references, r.notes, now, context.params.id
    )
    .run();
  return Response.json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare("DELETE FROM girls WHERE id=?")
    .bind(context.params.id)
    .run();
  return Response.json({ ok: true });
}
