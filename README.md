# Shidduch Ledger — Cloudflare Pages + D1 + Access

A private, shared prospect tracker: profiles for boys and girls, ranked match
suggestions, and a match log with outcomes. You own the code and the data;
only the email addresses you choose can ever open it.

## What's in here

- `index.html` — the whole app (frontend), one file.
- `functions/api/*` — the backend API (Cloudflare Pages Functions), reading
  and writing a Cloudflare D1 database.
- `schema.sql` — the database tables.
- `wrangler.toml` — only needed if you want to run this locally with the
  `wrangler` CLI; the dashboard-based deploy below doesn't require it.

## One-time setup (about 20 minutes)

### 1. Push this to GitHub

```
cd shidduch-ledger-cf
git init
git add .
git commit -m "Initial Shidduch Ledger"
gh repo create shidduch-ledger --private --source=. --remote=origin --push
```

(No `gh` CLI? Create an empty private repo on github.com, then
`git remote add origin <url>` and `git push -u origin main`.)

### 2. Create the D1 database

In the Cloudflare dashboard: **Workers & Pages → D1 → Create database**.
Name it `shidduch-ledger-db`.

Open the new database's **Console** tab, paste the contents of `schema.sql`,
and run it. This creates the `boys`, `girls`, and `matches` tables.

### 3. Create the Pages project

**Workers & Pages → Create → Pages → Connect to Git**, pick your new repo.

- Framework preset: **None**
- Build command: *(leave empty)*
- Build output directory: `/`

Deploy. It'll build successfully but the app will show a database error
banner until you complete step 4.

### 4. Bind the database to Pages

On the Pages project: **Settings → Functions → D1 database bindings → Add
binding**.

- Variable name: `DB` (must be exactly this — the code expects it)
- D1 database: `shidduch-ledger-db`

Do this for **both** the Production and Preview environments. Then go to
**Deployments** and retry the latest deployment (or just push a small commit)
so the binding takes effect.

### 5. Lock it down with Cloudflare Access

This is the step that makes it actually private.

Go to **Zero Trust → Access → Applications → Add an application → Self-hosted**.

- Application domain: your Pages URL (e.g. `shidduch-ledger.pages.dev`), or a
  custom domain if you've attached one
- Session duration: whatever you like (e.g. 24 hours)
- Add a policy: **Allow**, rule type **Emails**, list the exact addresses that
  should have access — your friend, her husband, and yourself
- Save

Cloudflare's free plan covers up to 50 users on Access, so this costs
nothing. From now on, opening the site prompts for an email address; if it's
on your list, Cloudflare emails a one-time code and lets them in. No
passwords to manage, and no one else can ever reach the page — not even with
the link.

### 6. Try it

Open the Pages URL. You (and whoever else you added) should be prompted to
verify by email, then land on the app. Add a couple of test profiles on the
Boys and Girls tabs, then try Find a Match.

## Making changes later

Edit the files, commit, and `git push`. Cloudflare Pages redeploys
automatically on every push to your main branch — no separate "publish"
step. Whoever's logged in via Access sees the update immediately on reload.

## How the pieces fit together

- **Access** is the privacy boundary — it decides who can load the page at
  all, before any of your code even runs.
- **D1** is the shared database — every boy, girl, and match is a row in it,
  visible to everyone who gets past Access.
- **Pages Functions** (`functions/api/*.js`) are small serverless endpoints
  that read/write D1 on the frontend's behalf.
- The frontend polls the API every 20 seconds and after every change, so
  everyone's view stays close to real-time without needing websockets.

## Notes

- Resumes aren't uploaded into the app — paste a Google Drive/Dropbox link
  into the "Resume" field on a profile instead. Keeping large files out of
  the database keeps things fast and free.
- The matching score (Find a Match tab) weighs: overlap in where each person
  wants to live (35 pts), same current location (10 pts), compatible
  learning-plan years (20 pts), shared interests (up to 20 pts), and
  learning/working in a similar area (15 pts). It's meant to narrow the
  field, not replace judgment — every score comes with the reasons behind it.
- If you ever want to add a real-time push instead of 20-second polling, or
  a proper login system beyond Access, that's a bigger change — just ask.
