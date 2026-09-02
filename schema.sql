-- Shidduch Ledger — D1 schema
-- Run this once against your D1 database (via the Cloudflare dashboard's
-- "Console" tab for the database, or `wrangler d1 execute shidduch-ledger-db --remote --file=./schema.sql`).

CREATE TABLE IF NOT EXISTS boys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  status TEXT NOT NULL DEFAULT 'Available',
  location TEXT,
  want_live TEXT,
  learn_plan TEXT,
  learn_place TEXT,
  interests TEXT,
  resume_link TEXT,
  mother_phone TEXT,
  character_references TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS girls (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  status TEXT NOT NULL DEFAULT 'Available',
  location TEXT,
  want_live TEXT,
  learn_plan TEXT,
  learn_place TEXT,
  interests TEXT,
  resume_link TEXT,
  mother_phone TEXT,
  character_references TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  boy_id TEXT NOT NULL,
  boy_name TEXT NOT NULL,
  girl_id TEXT NOT NULL,
  girl_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Suggested',
  date_suggested TEXT,
  suggested_by TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_boy ON matches(boy_id);
CREATE INDEX IF NOT EXISTS idx_matches_girl ON matches(girl_id);

-- Migration 2 — resume file storage (added when PDF upload + AI extraction
-- were introduced). If you already ran schema.sql before this was added,
-- run just these four ALTER TABLE lines once via the D1 Console (one at a
-- time). If you're setting up fresh, running the whole file top-to-bottom
-- is fine — these run after the tables above already exist.
ALTER TABLE boys ADD COLUMN resume_file_key TEXT;
ALTER TABLE boys ADD COLUMN resume_file_name TEXT;
ALTER TABLE girls ADD COLUMN resume_file_key TEXT;
ALTER TABLE girls ADD COLUMN resume_file_name TEXT;

-- Migration 3 — richer resume fields + a separate photo upload. Real
-- shidduch resumes vary a lot (there's no standard template), but almost
-- all of them include a date of birth, height, parents, siblings, and a
-- shul — and often split references into "family" and "personal". Run
-- these once via the D1 Console, one at a time.
ALTER TABLE boys ADD COLUMN date_of_birth TEXT;
ALTER TABLE boys ADD COLUMN height TEXT;
ALTER TABLE boys ADD COLUMN parents_info TEXT;
ALTER TABLE boys ADD COLUMN siblings_info TEXT;
ALTER TABLE boys ADD COLUMN shul_info TEXT;
ALTER TABLE boys ADD COLUMN family_references TEXT;
ALTER TABLE boys ADD COLUMN photo_file_key TEXT;
ALTER TABLE boys ADD COLUMN photo_file_name TEXT;
ALTER TABLE girls ADD COLUMN date_of_birth TEXT;
ALTER TABLE girls ADD COLUMN height TEXT;
ALTER TABLE girls ADD COLUMN parents_info TEXT;
ALTER TABLE girls ADD COLUMN siblings_info TEXT;
ALTER TABLE girls ADD COLUMN shul_info TEXT;
ALTER TABLE girls ADD COLUMN family_references TEXT;
ALTER TABLE girls ADD COLUMN photo_file_key TEXT;
ALTER TABLE girls ADD COLUMN photo_file_name TEXT;

-- Migration 4 — dated status-update history for matches. Instead of a
-- match's status just being overwritten, each change is logged as its own
-- row with a date and an optional note, so you can see the whole story
-- (Suggested -> First Date -> Ongoing -> ...) instead of just the latest
-- state. Run this once via the D1 Console.
CREATE TABLE IF NOT EXISTS match_updates (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_match_updates_match ON match_updates(match_id);
