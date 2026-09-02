# Shidduch Ledger — Cloudflare Workers + D1 + R2 + Access

A private, shared prospect tracker: a Dashboard overview of what's active
right now, profiles for boys and girls in a spreadsheet-style table, ranked
match suggestions, a match log where every status change is a dated,
timestamped update instead of just overwriting the last one, and PDF resume
uploads that Cloudflare's built-in AI reads automatically to fill in the
profile fields for you to review — plus a separate photo upload, since
pictures often come as their own attachment. You own the code and the
data; only the email addresses you choose can ever open it.

## What's in here

- `public/index.html` — the whole app (frontend), one file.
- `worker.js` — the backend: handles `/api/*` requests (reading/writing D1
  and R2, and running the resume text through Workers AI), and serves
  everything else as static files from `public/`.
- `schema.sql` — the database tables (run this once against your D1
  database; "Migration 2" adds the resume-file columns, "Migration 3" adds
  the richer resume fields plus the photo columns, and "Migration 4" adds
  the `match_updates` table that powers the dated status timeline — see
  step 2 below).
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

If you already had this database set up before, you only need to run the
new lines under whichever "Migration N" sections you haven't run yet, at
the bottom of `schema.sql` — the earlier tables are already there. Run
each line one at a time if the console is a single-line box.

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

Real shidduch resumes don't follow one fixed template — every family's
looks a little different. The AI extraction is deliberately flexible
about this: it looks for a set of common fields (date of birth, height,
parents, siblings, shul/rav, and separate "family" vs. "personal"
references, in addition to the original fields) wherever they appear on
the page, and never invents information that isn't actually there. If a
resume has extra content that doesn't fit any of those named fields, it
gets added to the Notes field instead of being silently dropped, so it's
worth skimming Notes after every upload.

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
resume and using "Upload & Extract with AI" to see the fields fill in, try
uploading a photo separately, then try Find a Match.

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
- Uploading a resume (PDF or Word **.docx**) stores the actual file (in R2)
  and asks Cloudflare Workers AI to read it and pre-fill the form fields.
  Always double-check what it filled in before saving — it's a head start,
  not a guarantee, and it's instructed never to invent information that
  isn't in the file. Older **.doc** files (the pre-2007 Word format) aren't
  supported — re-save as .docx or PDF first. You can also skip the upload
  and just paste a Google Drive/Dropbox link in the field below it, or use
  both.
- Don't have a file at all — just an email or WhatsApp message with someone's
  info in it? Paste that text into the **Or Paste Resume Text** box (right
  under the file upload) and click **Extract with AI**. It runs through the
  same AI extraction as an uploaded file and fills in the same fields —
  nothing gets saved as a file, since there isn't one; it's just a faster
  way in when the information didn't arrive as a PDF or Word doc.
- **Age is calculated automatically from Date of Birth** whenever that
  field has a recognizable date in it (it accepts most everyday formats —
  "March 4, 2001", "3/4/2001", "2001-03-04", etc.). When that's the case,
  the Age field greys out and shows "(from date of birth)" — it's kept in
  sync everywhere the person's age is shown, including as of today, not
  just whatever it was when the profile was saved. If Date of Birth is
  blank or isn't a date the app recognizes, Age goes back to being a
  regular field you fill in by hand.
- Photos are a separate upload from the resume, since they often come as
  their own attachment. Use the "Upload Photo" button in the form (accepts
  JPG, PNG, WEBP, or HEIC, up to 10MB) — it just stores the image, no AI
  involved, and shows a thumbnail once saved.
- The form also has fields for date of birth, height, parents, siblings,
  shul/rav, and family references (in addition to the original personal
  references field) — these fill in automatically from a resume upload
  when present, or can be typed in by hand.
- The girls' "learn place" field is labeled **Seminary** throughout the
  app; the same field is labeled "Where They Learn" for boys. Under the
  hood it's the same database column for both tables, just relabeled in
  the interface.
- The matching score (Find a Match tab) weighs: overlap in where each person
  wants to live (35 pts), same current location (10 pts), compatible
  learning-plan years (20 pts), shared interests (up to 20 pts), and
  learning/working in a similar area (15 pts). It's meant to narrow the
  field, not replace judgment — every score comes with the reasons behind it.
- The **Dashboard** tab is the at-a-glance view: total active matches,
  engaged/married counts, how many boys and girls are currently marked
  Available, a list of everything currently in progress, and a separate
  list of engagements and marriages. The Boys and Girls tables also each
  have a **Current Match** column showing the same thing for that person
  specifically (their most recently updated match and its status), so you
  don't have to jump to the Match Log to see what's going on with someone.
- In the **Match Log** (and on the Dashboard), a match's status is no
  longer just overwritten when it changes. Click **+ Add Update** on any
  match to log a new status with a date and an optional note — every
  update you've logged stays visible underneath that match as a timeline
  (e.g. Suggested → First Date, 3/1 → Ongoing, 3/12, "went really well").
  The match's status pill always reflects whichever logged update is most
  recent by date. You can delete a single mistaken update with the ✕ next
  to it, which recalculates the current status from what's left. The
  **Edit** button on a match is still there for fixing the boy/girl, who
  suggested it, or the original date/notes — status itself is only changed
  through Add Update once a match exists, so the timeline stays accurate.
- **+ Add a Boy**, **+ Add a Girl**, and **Bulk Upload Resumes** now live in a
  bar just under the tabs, not inside the Boys/Girls panels — they stay
  visible no matter which tab you're on or how far you've scrolled down a
  long table.
- **Bulk Upload Resumes** (in that same bar) lets you add a whole batch of
  people at once instead of one at a time. Choose Boys or Girls, select
  several resume files (PDF or Word), and click Start Upload — each file is
  read by AI and saved as its own new profile automatically, the same way a
  single upload works. If AI can't find a name in a resume, the file name is
  used instead so nothing is lost; either way, **open and check every
  profile it creates afterward** — it's a fast start, not a substitute for
  reviewing the details. Old .doc files and non-resume files are skipped
  with a note rather than stopping the whole batch.
- To **archive** someone instead of deleting them, set their Status to
  **Archived** (in the same dropdown as Available/Dating/etc., on their
  profile form or in the table's status filter). Archived profiles stay in
  the Boys/Girls tables (filter by "Archived" to see just them) and keep
  all their data, but they're automatically left out of Find a Match
  suggestions in both directions. To bring someone back, just change their
  status back to whatever it should be.
