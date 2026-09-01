// GET /api/whoami -> the email Cloudflare Access authenticated for this visitor.
// Used only to pre-fill the "Logging as" field; Access itself is what
// actually restricts who can reach the site at all.

export async function onRequestGet(context) {
  const email = context.request.headers.get("Cf-Access-Authenticated-User-Email") || "";
  return Response.json({ email });
}
