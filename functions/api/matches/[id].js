// PUT /api/matches/:id    -> update a match's status/notes
// DELETE /api/matches/:id -> remove a match from the log

export async function onRequestPut(context) {
  const body = await context.request.json();
  const now = new Date().toISOString();
  await context.env.DB.prepare(
    `UPDATE matches SET status=?, date_suggested=?, suggested_by=?, notes=?, updated_at=? WHERE id=?`
  )
    .bind(
      body.status || "Suggested",
      body.dateSuggested || now.slice(0, 10),
      body.suggestedBy || "",
      body.notes || "",
      now,
      context.params.id
    )
    .run();
  return Response.json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare("DELETE FROM matches WHERE id=?")
    .bind(context.params.id)
    .run();
  return Response.json({ ok: true });
}
