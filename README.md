# Shidduch Ledger — Cloudflare Workers + D1 + Access

A private, shared prospect tracker: profiles for boys and girls, ranked match
suggestions, and a match log with outcomes. You own the code and the data;
only the email addresses you choose can ever open it.

## What's in here

- `public/index.html` — the whole app (frontend), one file.
- `worker.js` — the backend: handles `/api/*` requests (reading/writing D1),
  and serves everything else as static files from `public/`.
- `schema.sql` — the database tables (run this once against your D1 database).
- `wrangler.toml` — tells Cloudflare how to wire this all together: which
  file is the entry point, where the static files live, and which D1
  database to attach as `env.DB`. This file is required — it's not optional
  local-only config.

## One-time setup

### 1. Push this to GitHub

Create a private repo, then add these files to it (GitHub Desktop, or the
web upload, or `git` on the command line — whichever you're comfortable
with). Make sure the folder structure comes through exactly as it is here:
`worker.js`, `wrangler.toml`, `schema.sql`, `README.md`, and a `public`
folder containing `index.html`.

### 2. Create the D1 database and run the schema

**Workers & Pages → D1 → Create database**, name it `shidduch-ledger-db`.
Open its **Console** tab and run each statement from `schema.sql` — paste
and execute them one at a time if the console is a single-line box rather
than a multi-line editor.

Copy the database's ID (shown on its Overview page) into `wrangler.toml`
where it says `database_id`.

### 3. Create the Worker project and connect it to GitHub

**Workers & Pages → Create → connect to your repo.** Because this repo has
a proper `wrangler.toml` with a real entry point (`worker.js`) and an assets
folder (`public/`), Cloudflare's build should deploy it correctly as a
single Worker that serves the site and runs the API — no extra dashboard
configuration should be needed for the database binding, since it's already
declared in `wrangler.toml` itself.

### 4. Lock it down with Cloudflare Access

This is the step that makes it actually private. In the project, go to the
**Access** tab (or Zero Trust → Access → Applications → Add an application →
Self-hosted, depending on where your dashboard puts it).

- Application domain: your `*.workers.dev` address, or a custom domain
- Scope: **all traffic** (not just previews) — this needs to cover the whole
  site, not only preview deployments
- Add a policy: **Allow**, rule type **Emails**, list the exact addresses
  that should have access — your friend, her husband, and yourself
- Save

Cloudflare's free plan covers up to 50 users on Access, so this costs
nothing. From now on, opening the site prompts for an email address; if
it's on your list, Cloudflare emails a one-time code and lets them in.

### 5. Try it

Open your site's address in a private/incognito window as a real test —
you should be asked to verify by email before anything loads. Once in, add
a couple of test profiles on the Boys and Girls tabs, then try Find a Match.

## Making changes later

Edit the files, commit, and push. Cloudflare redeploys automatically on
every push — no separate "publish" step.

## How the pieces fit together

- **Access** is the privacy boundary — it decides who can load the page at
  all, before any of your code even runs.
- **D1** is the shared database — every boy, girl, and match is a row in it.
- **`worker.js`** is the only server-side code — it checks if a request is
  for `/api/...` and handles it directly against D1; anything else it hands
  off to the static files in `public/`.
- The frontend polls the API every 20 seconds and after every change, so
  everyone's view stays close to real-time without needing websockets.

## Notes

- Resumes aren't uploaded into the app — paste a Google Drive/Dropbox link
  into the "Resume" field on a profile instead.
- The matching score (Find a Match tab) weighs: overlap in where each person
  wants to live (35 pts), same current location (10 pts), compatible
  learning-plan years (20 pts), shared interests (up to 20 pts), and
  learning/working in a similar area (15 pts). It's meant to narrow the
  field, not replace judgment — every score comes with the reasons behind it.
