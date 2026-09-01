// Shidduch Ledger — Worker entry point.
// Handles /api/* routes itself (reading/writing the D1 database), and hands
// every other request off to the static files (index.html, etc.) via the
// ASSETS binding. This replaces the old functions/ folder approach, which
// only works on classic Cloudflare Pages, not on this unified Workers setup.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url.pathname);
      } catch (err) {
        return new Response("Server error: " + err.message, { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};

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

async function handleApi(request, env, path) {
  const method = request.method;

  if (path === "/api/whoami" && method === "GET") {
    const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "";
    return Response.json({ email });
  }

  const boysMatch = path.match(/^\/api\/boys(?:\/([^/]+))?$/);
  if (boysMatch) return handlePersonTable(env, "boys", boysMatch[1], method, request);

  const girlsMatch = path.match(/^\/api\/girls(?:\/([^/]+))?$/);
  if (girlsMatch) return handlePersonTable(env, "girls", girlsMatch[1], method, request);

  const matchesMatch = path.match(/^\/api\/matches(?:\/([^/]+))?$/);
  if (matchesMatch) return handleMatches(env, matchesMatch[1], method, request);

  return new Response("Not found", { status: 404 });
}

async function handlePersonTable(env, table, id, method, request) {
  if (method === "GET" && !id) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY name ASC`).all();
    return Response.json(results);
  }

  if (method === "POST" && !id) {
    const body = await request.json();
    const r = rowFromBody(body);
    if (!r.name) return new Response("Name is required", { status: 400 });
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO ${table}
        (id, name, age, status, location, want_live, learn_plan, learn_place, interests, resume_link, mother_phone, character_references, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(newId, r.name, r.age, r.status, r.location, r.want_live, r.learn_plan, r.learn_place, r.interests, r.resume_link, r.mother_phone, r.character_references, r.notes, now, now)
      .run();
    return Response.json({ id: newId });
  }

  if (method === "PUT" && id) {
    const body = await request.json();
    const r = rowFromBody(body);
    if (!r.name) return new Response("Name is required", { status: 400 });
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE ${table} SET
        name=?, age=?, status=?, location=?, want_live=?, learn_plan=?, learn_place=?,
        interests=?, resume_link=?, mother_phone=?, character_references=?, notes=?, updated_at=?
       WHERE id=?`
    )
      .bind(r.name, r.age, r.status, r.location, r.want_live, r.learn_plan, r.learn_place, r.interests, r.resume_link, r.mother_phone, r.character_references, r.notes, now, id)
      .run();
    return Response.json({ ok: true });
  }

  if (method === "DELETE" && id) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}

async function handleMatches(env, id, method, request) {
  if (method === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT * FROM matches ORDER BY updated_at DESC").all();
    return Response.json(results);
  }

  if (method === "POST" && !id) {
    const body = await request.json();
    if (!body.boyId || !body.girlId) {
      return new Response("boyId and girlId are required", { status: 400 });
    }
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO matches
        (id, boy_id, boy_name, girl_id, girl_name, status, date_suggested, suggested_by, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(newId, body.boyId, body.boyName || "", body.girlId, body.girlName || "", body.status || "Suggested", body.dateSuggested || now.slice(0, 10), body.suggestedBy || "", body.notes || "", now, now)
      .run();
    return Response.json({ id: newId });
  }

  if (method === "PUT" && id) {
    const body = await request.json();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE matches SET status=?, date_suggested=?, suggested_by=?, notes=?, updated_at=? WHERE id=?`
    )
      .bind(body.status || "Suggested", body.dateSuggested || now.slice(0, 10), body.suggestedBy || "", body.notes || "", now, id)
      .run();
    return Response.json({ ok: true });
  }

  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM matches WHERE id=?").bind(id).run();
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
