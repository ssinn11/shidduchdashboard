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
