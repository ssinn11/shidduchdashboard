// Shidduch Ledger — Worker entry point.
// Handles /api/* routes itself (reading/writing the D1 database), and hands
// every other request off to the static files (index.html, etc.) via the
// ASSETS binding. This replaces the old functions/ folder approach, which
// only works on classic Cloudflare Pages, not on this unified Workers setup.

import { extractText, getDocumentProxy } from "unpdf";

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
    resume_file_key: body.resumeFileKey || "",
    resume_file_name: body.resumeFileName || "",
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

  if (path === "/api/resume" && method === "POST") {
    return handleResumeUpload(env, request);
  }

  const fileMatch = path.match(/^\/api\/files\/(.+)$/);
  if (fileMatch && method === "GET") {
    return handleFileServe(env, decodeURIComponent(fileMatch[1]));
  }

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
        (id, name, age, status, location, want_live, learn_plan, learn_place, interests, resume_link, resume_file_key, resume_file_name, mother_phone, character_references, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(newId, r.name, r.age, r.status, r.location, r.want_live, r.learn_plan, r.learn_place, r.interests, r.resume_link, r.resume_file_key, r.resume_file_name, r.mother_phone, r.character_references, r.notes, now, now)
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
        interests=?, resume_link=?, resume_file_key=?, resume_file_name=?, mother_phone=?, character_references=?, notes=?, updated_at=?
       WHERE id=?`
    )
      .bind(r.name, r.age, r.status, r.location, r.want_live, r.learn_plan, r.learn_place, r.interests, r.resume_link, r.resume_file_key, r.resume_file_name, r.mother_phone, r.character_references, r.notes, now, id)
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

// ---------- resume upload + AI extraction ----------

// Accepts a multipart/form-data POST with fields:
//   file  — the PDF (required)
//   table — "boys" or "girls" (required, only changes the wording asked of the AI)
// Stores the PDF in R2, asks Claude to read it and pull out profile fields,
// and returns both the file reference and whatever Claude found so the
// frontend can pre-fill the form for a human to review before saving.
async function handleResumeUpload(env, request) {
  const form = await request.formData();
  const file = form.get("file");
  const table = form.get("table") === "girls" ? "girls" : "boys";

  if (!file || typeof file.arrayBuffer !== "function") {
    return new Response("A PDF file is required", { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return new Response("Only PDF files are supported", { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const MAX_BYTES = 15 * 1024 * 1024; // keep well under Worker + Claude limits
  if (bytes.byteLength > MAX_BYTES) {
    return new Response("That PDF is too large (15MB max)", { status: 400 });
  }

  const key = `${table}/${crypto.randomUUID()}.pdf`;
  await env.RESUMES.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });

  const fileName = (file.name || "resume.pdf").toString();
  const result = { key, name: fileName, extracted: null, extractError: null };

  try {
    result.extracted = await extractResumeWithWorkersAI(env, bytes, table);
  } catch (err) {
    result.extractError = "Couldn't read the resume automatically: " + err.message + ". The file was still saved — fill in the fields by hand.";
  }

  return Response.json(result);
}

// Uses Cloudflare Workers AI (included free with your Cloudflare account,
// up to 10,000 neurons/day) instead of a paid third-party API. Text is
// pulled out of the PDF locally with `unpdf`, then a small instruct model
// is asked to fill in a fixed JSON shape from that text. This only works
// for PDFs that have real selectable text — a resume that's actually a
// scanned image of a paper document won't have any text to extract.
async function extractResumeWithWorkersAI(env, pdfBytes, table) {
  let text;
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
    const extracted = await extractText(doc, { mergePages: true });
    text = (extracted.text || "").trim();
  } catch (err) {
    throw new Error("couldn't read this PDF's text (" + err.message + ")");
  }

  if (text.length < 20) {
    throw new Error("this PDF doesn't have selectable text (it may be a scanned image) — AI can't read it automatically");
  }
  if (text.length > 12000) text = text.slice(0, 12000); // keep the request small

  const learnLabel = table === "girls" ? "seminary" : "yeshiva / where they learn";
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "string" },
      location: { type: "string" },
      wantLive: { type: "string" },
      learnPlan: { type: "string" },
      learnPlace: { type: "string" },
      interests: { type: "string" },
      motherPhone: { type: "string" },
      references: { type: "string" },
    },
    required: ["name", "age", "location", "wantLive", "learnPlan", "learnPlace", "interests", "motherPhone", "references"],
  };

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content:
          "You extract structured contact/bio info from shidduch (matchmaking) resumes for religious Jewish singles. " +
          "Reply using only information actually present in the text. Use an empty string for anything you can't find — never invent or guess.",
      },
      {
        role: "user",
        content:
          "Here is the text of a resume for a " + (table === "girls" ? "young woman" : "young man") + ". " +
          'The "learnPlace" field means their current ' + learnLabel + ". " +
          "Extract: full name, age, current location/city, where they want to live (if mentioned), " +
          "their learning plan/commitment, their " + learnLabel + ", comma-separated interests, " +
          "mother's phone number (if listed), and any character references listed.\n\nResume text:\n" + text,
      },
    ],
    response_format: { type: "json_schema", json_schema: schema },
  });

  let parsed = result && result.response;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch (e) { throw new Error("AI returned an unexpected format"); }
  }
  if (!parsed || typeof parsed !== "object") throw new Error("AI returned no data");

  return {
    name: parsed.name || "",
    age: parsed.age ? Number(parsed.age) || null : null,
    location: parsed.location || "",
    wantLive: parsed.wantLive || "",
    learnPlan: parsed.learnPlan || "",
    learnPlace: parsed.learnPlace || "",
    interests: parsed.interests || "",
    motherPhone: parsed.motherPhone || "",
    references: parsed.references || "",
  };
}

async function handleFileServe(env, key) {
  const obj = await env.RESUMES.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set("content-type", obj.httpMetadata && obj.httpMetadata.contentType ? obj.httpMetadata.contentType : "application/pdf");
  headers.set("content-disposition", "inline");
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  return new Response(obj.body, { headers: headers });
}
