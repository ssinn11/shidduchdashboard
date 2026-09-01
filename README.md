# Shidduch Ledger — Cloudflare Workers + D1 + R2 + Access

A private, shared prospect tracker: profiles for boys and girls in a
spreadsheet-style table, ranked match suggestions, a match log with
outcomes, and PDF resume uploads that Cloudflare's built-in AI reads
automatically to fill in the profile fields for you to review. You own the
code and the data; only the email addresses you choose can ever open it.

## What's in here

- `public/index.html` — the whole app (frontend), one file.
- `worker.js` — the backend: handles `/api/*` requests (reading/writing D1
  and R2, and running the resume text through Workers AI), and serves
  everything else as static files from `public/`.
- `schema.sql` — the database tables (run this once against your D1
  database; a "Migration 2" section near the bottom adds the resume-file
  columns — see step 2 below).
- `wrangler.toml` — tells Cloudflare how to wire this all together: which
  file is the entry point, where the static files live, which D1 database
  to attach as `env.DB`, which R2 bucket to attach as `env.RESUMES`, and
  that the Worker gets access to Workers AI as `env.AI`. This file is
  required — it's not optional local-only config.
- `package.json` — lists `unpdf`, the one small library the Worker uses to
  pull text out of an uploaded PDF before handing it to AI. Cloudflare
  installs it automatically during deploy; you don't need Node installed
  anywhere yourself.

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

If you already had this database set up before resumes/PDFs were added,
you only need to run the four new lines under "Migration 2" at the bottom
of `schema.sql` (the `ALTER TABLE ... ADD COLUMN` ones) — the earlier
tables are already there.

Copy the database's ID (shown on its Overview page) into `wrangler.toml`
where it says `database_id`.

### 3. Create the R2 bucket for resume files

**Workers & Pages → R2 Object Storage → Create bucket.** Name it exactly
`shidduch-ledger-files` (that's the name already set in `wrangler.toml` —
using a different name means you'd need to edit that file to match).
Location/defaults are fine as-is. Cloudflare's free plan includes 10GB of
R2 storage, which is enormously more than a folder of resume PDFs needs.

### 4. Nothing to do for AI — it's already included

"Upload & Extract with AI" runs on **Cloudflare Workers AI**, which comes
with your Cloudflare account at no extra cost (10,000 free "neurons" a
day — far more than a matchmaker doing occasional resume uploads will
use). There's no separate account to create and no API key to add for
this — the `[ai]` binding in `wrangler.toml` is all it needs.

One real limitation to know about: this only works on PDFs that have
actual selectable text in them (the normal kind, exported from Word,
Google Docs, Canva, etc.). A resume that's really a scanned photo or scan
of a paper document has no text to read, so extraction will fail for
those — the file still uploads and saves fine, you'll just fill in the
fields by hand for that one.

### 5. Create the Worker project and connect it to GitHub

**Workers & Pages → Create → connect to your repo.** Because this repo has
a proper `wrangler.toml` with a real entry point (`worker.js`) and an assets
folder (`public/`), Cloudflare's build should deploy it correctly as a
single Worker that serves the site and runs the API — no extra dashboard
configuration should be needed for the database binding, since it's already
declared in `wrangler.toml` itself.

### 6. Lock it down with Cloudflare Access

This is the step that makes it actually private. On the Worker, open the
**Access** tab and click **Manage access** on the policy shown there (or
go to Zero Trust → Access → Applications if you don't see it on the Worker
page directly).

- Scope: **all traffic** (not just previews) — this needs to cover the
  whole site, not only preview deployments
- The policy's rule type should be **Emails**, listing the exact addresses
  that should have access — your friend, her husband, and yourself. (Not
  "Cloudflare account members" — that only lets people who are members of
  *your* Cloudflare account in, which in practice would just be you.)
- Save

Cloudflare's free plan covers up to 50 users on Access, so this costs
nothing. From now on, opening the site prompts for an email address; if
it's on your list, Cloudflare emails a one-time code and lets them in.

### 7. Try it

Open your site's address in a private/incognito window as a real test —
you should be asked to verify by email before anything loads. Once in, add
a couple of test profiles on the Boys and Girls tabs, try uploading a PDF
resume and using "Upload & Extract with AI" to see the fields fill in, then
try Find a Match.

## Making changes later

Edit the files, commit, and push. Cloudflare redeploys automatically on
every push — no separate "publish" step.

## How the pieces fit together

- **Access** is the privacy boundary — it decides who can load the page at
  all, before any of your code even runs.
- **D1** is the shared database — every boy, girl, and match is a row in it.
- **R2** is where uploaded resume PDFs actually live; D1 just stores a
  pointer (`resume_file_key`) to the file in R2.
- **`worker.js`** is the only server-side code — it checks if a request is
  for `/api/...` and handles it directly against D1/R2/Workers AI; anything
  else it hands off to the static files in `public/`.
- The frontend polls the API every 20 seconds and after every change, so
  everyone's view stays close to real-time without needing websockets.

## Notes

- Boys and Girls each show as a spreadsheet-style table — click any row to
  open the full edit form (nothing saves until you click Save in that
  form, so browsing the table is safe).
- Uploading a PDF resume stores the actual file (in R2) and asks Cloudflare
  Workers AI to read it and pre-fill the form fields. Always double-check
  what it filled in before saving — it's a head start, not a guarantee,
  and it's instructed never to invent information that isn't in the PDF.
  You can also skip the upload and just paste a Google Drive/Dropbox link
  in the field below it, or use both.
- The girls' "learn place" field is labeled **Seminary** throughout the
  app; the same field is labeled "Where They Learn" for boys. Under the
  hood it's the same database column for both tables, just relabeled in
  the interface.
- The matching score (Find a Match tab) weighs: overlap in where each person
  wants to live (35 pts), same current location (10 pts), compatible
  learning-plan years (20 pts), shared interests (up to 20 pts), and
  learning/working in a similar area (15 pts). It's meant to narrow the
  field, not replace judgment — every score comes with the reasons behind it.
