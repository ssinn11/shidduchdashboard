// Shidduch Ledger — Worker entry point.
// Handles /api/* routes itself (reading/writing the D1 database), and hands
// every other request off to the static files (index.html, etc.) via the
// ASSETS binding. This replaces the old functions/ folder approach, which
// only works on classic Cloudflare Pages, not on this unified Workers setup.

import { extractText, getDocumentProxy } from "unpdf";
import { unzipSync, strFromU8 } from "fflate";

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
    date_of_birth: body.dateOfBirth || "",
    height: body.height || "",
    parents_info: body.parents || "",
    siblings_info: body.siblings || "",
    shul_info: body.shul || "",
    family_references: body.familyReferences || "",
    photo_file_key: body.photoFileKey || "",
    photo_file_name: body.photoFileName || "",
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

  const matchUpdatesAddMatch = path.match(/^\/api\/matches\/([^/]+)\/updates$/);
  if (matchUpdatesAddMatch && method === "POST") {
    return handleAddMatchUpdate(env, matchUpdatesAddMatch[1], request);
  }

  if (path === "/api/match-updates" && method === "GET") {
    return handleListMatchUpdates(env);
  }

  const matchUpdateIdMatch = path.match(/^\/api\/match-updates\/([^/]+)$/);
  if (matchUpdateIdMatch && method === "DELETE") {
    return handleDeleteMatchUpdate(env, matchUpdateIdMatch[1]);
  }

  const matchesMatch = path.match(/^\/api\/matches(?:\/([^/]+))?$/);
  if (matchesMatch) return handleMatches(env, matchesMatch[1], method, request);

  if (path === "/api/resume" && method === "POST") {
    return handleResumeUpload(env, request);
  }

  if (path === "/api/resume-text" && method === "POST") {
    return handleResumeTextExtract(env, request);
  }

  if (path === "/api/photo" && method === "POST") {
    return handlePhotoUpload(env, request);
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
        (id, name, age, status, location, want_live, learn_plan, learn_place, interests, resume_link, resume_file_key, resume_file_name, mother_phone, character_references, notes, date_of_birth, height, parents_info, siblings_info, shul_info, family_references, photo_file_key, photo_file_name, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(newId, r.name, r.age, r.status, r.location, r.want_live, r.learn_plan, r.learn_place, r.interests, r.resume_link, r.resume_file_key, r.resume_file_name, r.mother_phone, r.character_references, r.notes, r.date_of_birth, r.height, r.parents_info, r.siblings_info, r.shul_info, r.family_references, r.photo_file_key, r.photo_file_name, now, now)
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
        interests=?, resume_link=?, resume_file_key=?, resume_file_name=?, mother_phone=?, character_references=?, notes=?,
        date_of_birth=?, height=?, parents_info=?, siblings_info=?, shul_info=?, family_references=?, photo_file_key=?, photo_file_name=?, updated_at=?
       WHERE id=?`
    )
      .bind(r.name, r.age, r.status, r.location, r.want_live, r.learn_plan, r.learn_place, r.interests, r.resume_link, r.resume_file_key, r.resume_file_name, r.mother_phone, r.character_references, r.notes, r.date_of_birth, r.height, r.parents_info, r.siblings_info, r.shul_info, r.family_references, r.photo_file_key, r.photo_file_name, now, id)
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
    // Seed the first entry in the status-update timeline so it starts here.
    await env.DB.prepare(
      `INSERT INTO match_updates (id, match_id, status, date, note, created_at) VALUES (?,?,?,?,?,?)`
    )
      .bind(crypto.randomUUID(), newId, body.status || "Suggested", body.dateSuggested || now.slice(0, 10), body.notes || "", now)
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
    await env.DB.prepare("DELETE FROM match_updates WHERE match_id=?").bind(id).run();
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}

// ---------- match status-update history ----------

async function handleAddMatchUpdate(env, matchId, request) {
  const body = await request.json();
  if (!body.status) return new Response("status is required", { status: 400 });
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const date = body.date || now.slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO match_updates (id, match_id, status, date, note, created_at) VALUES (?,?,?,?,?,?)`
  )
    .bind(newId, matchId, body.status, date, body.note || "", now)
    .run();

  // Keep the match's own "current status" in sync with whichever logged
  // update is chronologically most recent (by date, then by when it was
  // entered) — not necessarily the one that was just added, in case
  // updates are logged out of order.
  const latest = await env.DB.prepare(
    `SELECT status FROM match_updates WHERE match_id=? ORDER BY date DESC, created_at DESC LIMIT 1`
  )
    .bind(matchId)
    .first();
  if (latest) {
    await env.DB.prepare(`UPDATE matches SET status=?, updated_at=? WHERE id=?`)
      .bind(latest.status, now, matchId)
      .run();
  }
  return Response.json({ id: newId });
}

async function handleListMatchUpdates(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM match_updates ORDER BY date DESC, created_at DESC"
  ).all();
  return Response.json(results);
}

async function handleDeleteMatchUpdate(env, id) {
  const row = await env.DB.prepare("SELECT match_id FROM match_updates WHERE id=?").bind(id).first();
  await env.DB.prepare("DELETE FROM match_updates WHERE id=?").bind(id).run();
  if (row) {
    const latest = await env.DB.prepare(
      `SELECT status FROM match_updates WHERE match_id=? ORDER BY date DESC, created_at DESC LIMIT 1`
    )
      .bind(row.match_id)
      .first();
    if (latest) {
      await env.DB.prepare(`UPDATE matches SET status=?, updated_at=? WHERE id=?`)
        .bind(latest.status, new Date().toISOString(), row.match_id)
        .run();
    }
  }
  return Response.json({ ok: true });
}

// ---------- resume upload + AI extraction ----------

// Accepts a multipart/form-data POST with fields:
//   file  — the PDF (required)
//   table — "boys" or "girls" (required, only changes the wording asked of the AI)
// Stores the PDF in R2, asks Claude to read it and pull out profile fields,
// and returns both the file reference and whatever Claude found so the
// frontend can pre-fill the form for a human to review before saving.
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function resumeKindFromFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".docx") || file.type === DOCX_MIME) return "docx";
  if (name.endsWith(".doc") || file.type === "application/msword") return "doc";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return null;
}

async function handleResumeUpload(env, request) {
  const form = await request.formData();
  const file = form.get("file");
  const table = form.get("table") === "girls" ? "girls" : "boys";

  if (!file || typeof file.arrayBuffer !== "function") {
    return new Response("A PDF or Word (.docx) file is required", { status: 400 });
  }
  const kind = resumeKindFromFile(file);
  if (kind === "doc") {
    return new Response(
      "That's an older .doc file, which isn't supported — please re-save it as .docx (or a PDF) and upload that instead.",
      { status: 400 }
    );
  }
  if (kind !== "pdf" && kind !== "docx") {
    return new Response("Only PDF or Word (.docx) files are supported", { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const MAX_BYTES = 15 * 1024 * 1024; // keep well under Worker + Claude limits
  if (bytes.byteLength > MAX_BYTES) {
    return new Response("That file is too large (15MB max)", { status: 400 });
  }

  const contentType = kind === "docx" ? DOCX_MIME : "application/pdf";
  const key = `${table}/${crypto.randomUUID()}.${kind}`;
  await env.RESUMES.put(key, bytes, { httpMetadata: { contentType } });

  const fileName = (file.name || (kind === "docx" ? "resume.docx" : "resume.pdf")).toString();
  const result = { key, name: fileName, extracted: null, extractError: null };

  try {
    result.extracted = await extractResumeWithWorkersAI(env, bytes, table, kind);
  } catch (err) {
    result.extractError = "Couldn't read the resume automatically: " + err.message + ". The file was still saved — fill in the fields by hand.";
  }

  return Response.json(result);
}

// Same AI extraction as the file-upload path, but for text pasted directly
// into the app (an email, a WhatsApp message, whatever a resume arrived
// as) instead of an uploaded file — nothing gets saved to R2 here, there's
// just no file involved.
async function handleResumeTextExtract(env, request) {
  const body = await request.json();
  const table = body.table === "girls" ? "girls" : "boys";
  const text = (body.text || "").toString().trim();

  if (text.length < 20) {
    return new Response("Paste in a bit more text — that's not enough to work with", { status: 400 });
  }

  try {
    const extracted = await runResumeExtractionAI(env, text, table);
    return Response.json({ extracted });
  } catch (err) {
    return new Response("Couldn't read that text automatically: " + err.message, { status: 500 });
  }
}

// Pulls the raw text out of a .docx file (a zip archive containing an XML
// document at word/document.xml). No dependency on Word or any Node-only
// APIs — just unzips the bytes and strips the XML tags, which is enough to
// get readable text out for the AI step below. Older, binary .doc files
// are a completely different (and much harder to parse) format, so those
// are rejected earlier in handleResumeUpload rather than attempted here.
function extractDocxText(bytes) {
  let zip;
  try {
    zip = unzipSync(new Uint8Array(bytes));
  } catch (err) {
    throw new Error("couldn't open this Word file (" + err.message + ")");
  }
  const xmlBytes = zip["word/document.xml"];
  if (!xmlBytes) throw new Error("couldn't find any document content inside this Word file");
  const xml = strFromU8(xmlBytes);

  let text = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text.trim();
}

// Uses Cloudflare Workers AI (included free with your Cloudflare account,
// up to 10,000 neurons/day) instead of a paid third-party API. Text is
// pulled out of the file locally (with `unpdf` for PDFs, or a small zip/XML
// unwrap for Word .docx files), then a small instruct model is asked to
// fill in a fixed JSON shape from that text. This only works for files that
// have real extractable text — a resume that's actually a scanned image of
// a paper document won't have any text to extract.
async function extractResumeWithWorkersAI(env, fileBytes, table, kind) {
  let text;
  if (kind === "docx") {
    try {
      text = extractDocxText(fileBytes);
    } catch (err) {
      throw new Error(err.message);
    }
  } else {
    try {
      const doc = await getDocumentProxy(new Uint8Array(fileBytes));
      const extracted = await extractText(doc, { mergePages: true });
      text = (extracted.text || "").trim();
    } catch (err) {
      throw new Error("couldn't read this PDF's text (" + err.message + ")");
    }
  }

  if (text.length < 20) {
    throw new Error(
      kind === "docx"
        ? "this Word file doesn't seem to have any readable text in it"
        : "this PDF doesn't have selectable text (it may be a scanned image) — AI can't read it automatically"
    );
  }

  return runResumeExtractionAI(env, text, table);
}

// Shared by the file-upload path above and the paste-text path (handleResumeTextExtract)
// below — everything from here on just needs a plain string of resume text,
// regardless of where it came from.
async function runResumeExtractionAI(env, text, table) {
  if (text.length > 12000) text = text.slice(0, 12000); // keep the request small

  const learnLabel = table === "girls" ? "seminary" : "yeshiva / where they learn";
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "string" },
      dateOfBirth: { type: "string" },
      height: { type: "string" },
      location: { type: "string" },
      wantLive: { type: "string" },
      learnPlan: { type: "string" },
      learnPlace: { type: "string" },
      interests: { type: "string" },
      motherPhone: { type: "string" },
      parents: { type: "string" },
      siblings: { type: "string" },
      shul: { type: "string" },
      familyReferences: { type: "string" },
      references: { type: "string" },
      notes: { type: "string" },
    },
    required: [
      "name", "age", "dateOfBirth", "height", "location", "wantLive", "learnPlan", "learnPlace",
      "interests", "motherPhone", "parents", "siblings", "shul", "familyReferences", "references", "notes",
    ],
  };

  const result = await withTimeout(
    env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    messages: [
      {
        role: "system",
        content:
          "You extract structured contact/bio info from shidduch (matchmaking) resumes for religious Jewish singles. " +
          "These resumes have no standard template — every family/matchmaker formats them differently, uses different " +
          "section headings, and includes different combinations of information. Do your best to map information to " +
          "the right field even when it's labeled differently than you'd expect (for example a 'DOB' or 'Born' line is " +
          "dateOfBirth; a 'Family' or 'Background' section is parents/siblings). " +
          "Reply using only information actually present in the text — never invent or guess. Use an empty string for " +
          "anything not present. If you notice clearly relevant information that doesn't fit any other field, put a " +
          "short summary of it in the 'notes' field instead of dropping it.",
      },
      {
        role: "user",
        content:
          "Here is the text of a resume for a " + (table === "girls" ? "young woman" : "young man") + ". " +
          'The "learnPlace" field means their current ' + learnLabel + ". " +
          "Extract: full name; age (as a plain number if given, or leave blank if only a date of birth is given); " +
          "date of birth (dateOfBirth) if stated; height if stated; current location/city; where they want to live " +
          "(if mentioned); their learning plan/commitment; their " + learnLabel + "; comma-separated interests; " +
          "mother's phone number (if listed); a short summary of parents (names/occupations, if given); a short " +
          "summary of siblings (if given); their shul/synagogue and rabbi (if given); any references listed under a " +
          "heading like 'Family References' (familyReferences); any other references, such as 'Personal " +
          "References', 'Character References', or an unlabeled reference list (references); and anything else " +
          "clearly relevant that doesn't fit the above (notes).\n\nResume text:\n" + text,
      },
    ],
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens: 1536,
    }),
    25000,
    "the AI took too long to respond"
  );

  let parsed = result && result.response;
  if (typeof parsed === "string") {
    parsed = parseAiJson(parsed);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("AI returned an unexpected format");

  return {
    name: parsed.name || "",
    age: parsed.age ? Number(parsed.age) || null : null,
    dateOfBirth: parsed.dateOfBirth || "",
    height: parsed.height || "",
    location: parsed.location || "",
    wantLive: parsed.wantLive || "",
    learnPlan: parsed.learnPlan || "",
    learnPlace: parsed.learnPlace || "",
    interests: parsed.interests || "",
    motherPhone: parsed.motherPhone || "",
    parents: parsed.parents || "",
    siblings: parsed.siblings || "",
    shul: parsed.shul || "",
    familyReferences: parsed.familyReferences || "",
    references: parsed.references || "",
    notes: parsed.notes || "",
  };
}

// Workers AI's JSON mode is best-effort, not guaranteed — some models wrap
// the JSON in a markdown code fence, or add a stray sentence before/after
// it. Try a few increasingly forgiving strategies before giving up.
// Guards against a slow/stuck Workers AI call holding the whole request
// open until the platform itself kills the connection (which shows up to
// the browser as a raw, ugly network error instead of a clean response).
// If the AI hasn't answered within `ms`, give up on it ourselves and let
// the caller fall back to "fill in by hand" instead.
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseAiJson(raw) {
  let text = String(raw).trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    // fall through to the more forgiving strategy below
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      // give up below
    }
  }

  return null;
}

async function handleFileServe(env, key) {
  const obj = await env.RESUMES.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set("content-type", obj.httpMetadata && obj.httpMetadata.contentType ? obj.httpMetadata.contentType : "application/octet-stream");
  headers.set("content-disposition", "inline");
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  return new Response(obj.body, { headers: headers });
}

// ---------- photo upload (separate from the PDF resume, no AI involved) ----------

// Accepts a multipart/form-data POST with fields:
//   file  — a jpg/png image (required)
//   table — "boys" or "girls" (just used to organize the R2 key)
// Stores the image in R2 (same bucket as resumes, different key prefix) and
// returns its reference. Used for the common case where a matchmaker has a
// separate photo attachment rather than one embedded in the resume PDF.
async function handlePhotoUpload(env, request) {
  const form = await request.formData();
  const file = form.get("file");
  const table = form.get("table") === "girls" ? "girls" : "boys";

  if (!file || typeof file.arrayBuffer !== "function") {
    return new Response("An image file is required", { status: 400 });
  }
  const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
  const ext = ALLOWED[file.type];
  if (!ext) {
    return new Response("Please upload a JPG, PNG, WEBP, or HEIC image", { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const MAX_BYTES = 10 * 1024 * 1024;
  if (bytes.byteLength > MAX_BYTES) {
    return new Response("That image is too large (10MB max)", { status: 400 });
  }

  const key = `${table}/photos/${crypto.randomUUID()}.${ext}`;
  await env.RESUMES.put(key, bytes, { httpMetadata: { contentType: file.type } });

  return Response.json({ key, name: (file.name || "photo." + ext).toString() });
}
