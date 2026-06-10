-- read — initial schema. See TECH-DESIGN.md.
-- One D1, written by read-mcp (/ingest + tools), read by read-web (SSR).
-- A book is keyed by KOReader's content md5 (stable per file). Ingest is upsert by md5;
-- sessions/annotations dedupe on natural keys so re-sending the whole payload is safe.

PRAGMA foreign_keys = ON;

CREATE TABLE books (
  md5               TEXT PRIMARY KEY,            -- KOReader partial md5
  title             TEXT NOT NULL,
  authors           TEXT,
  series            TEXT,
  language          TEXT,
  isbn              TEXT,                         -- from doc_props identifiers, when present
  pages             INTEGER,
  percent_finished  REAL NOT NULL DEFAULT 0,      -- 0..1
  status            TEXT NOT NULL DEFAULT 'unread'
                    CHECK (status IN ('unread','reading','finished','paused','abandoned')),
  rating            REAL,                         -- 0..5 if set (stored even if UI defers it)
  review            TEXT,                         -- summary note, if set
  last_open         INTEGER,                      -- unix seconds
  total_read_time   INTEGER NOT NULL DEFAULT 0,   -- seconds
  total_read_pages  INTEGER NOT NULL DEFAULT 0,
  current_chapter   TEXT,                         -- resume location
  cover_url         TEXT,                         -- resolved Open Library cover (cached)
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_books_status    ON books(status);
CREATE INDEX idx_books_last_open ON books(last_open DESC);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_md5    TEXT NOT NULL REFERENCES books(md5) ON DELETE CASCADE,
  page        INTEGER NOT NULL,
  start_time  INTEGER NOT NULL,                   -- unix seconds (UTC), from page_stat_data
  duration    INTEGER NOT NULL,                   -- seconds spent on the page
  total_pages INTEGER NOT NULL DEFAULT 0,
  UNIQUE (book_md5, page, start_time)
);
CREATE INDEX idx_sessions_book  ON sessions(book_md5);
CREATE INDEX idx_sessions_start ON sessions(start_time);

CREATE TABLE annotations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  book_md5       TEXT NOT NULL REFERENCES books(md5) ON DELETE CASCADE,
  datetime       TEXT NOT NULL,                   -- KOReader "YYYY-MM-DD HH:MM:SS" (device-local)
  datetime_epoch INTEGER NOT NULL DEFAULT 0,      -- parsed to unix seconds (device tz) for ordering
  chapter        TEXT,
  page           INTEGER,
  text           TEXT,                            -- highlighted source text
  note           TEXT,                            -- user's note (nullable)
  color          TEXT,
  pos0           TEXT,                            -- xpointer; part of the dedupe key
  pos1           TEXT,
  UNIQUE (book_md5, datetime, pos0)
);
CREATE INDEX idx_annotations_book ON annotations(book_md5);
CREATE INDEX idx_annotations_dt   ON annotations(datetime_epoch DESC);

-- Full-text over the highlighted text + note, for search_highlights. External-content
-- FTS tied to annotations.id, kept in sync by triggers — so an idempotent re-ingest
-- (INSERT OR IGNORE that actually inserts) indexes exactly the new rows, and ignored
-- duplicates touch nothing.
CREATE VIRTUAL TABLE annotations_fts USING fts5(
  text, note,
  content = 'annotations',
  content_rowid = 'id',
  tokenize = 'unicode61'
);
CREATE TRIGGER annotations_ai AFTER INSERT ON annotations BEGIN
  INSERT INTO annotations_fts(rowid, text, note) VALUES (new.id, new.text, new.note);
END;
CREATE TRIGGER annotations_ad AFTER DELETE ON annotations BEGIN
  INSERT INTO annotations_fts(annotations_fts, rowid, text, note) VALUES ('delete', old.id, old.text, old.note);
END;
CREATE TRIGGER annotations_au AFTER UPDATE ON annotations BEGIN
  INSERT INTO annotations_fts(annotations_fts, rowid, text, note) VALUES ('delete', old.id, old.text, old.note);
  INSERT INTO annotations_fts(rowid, text, note) VALUES (new.id, new.text, new.note);
END;

CREATE TABLE ingest_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  device            TEXT,
  koreader_version  TEXT,
  generated_at      INTEGER,
  books_n           INTEGER NOT NULL DEFAULT 0,
  sessions_n        INTEGER NOT NULL DEFAULT 0,
  annotations_n     INTEGER NOT NULL DEFAULT 0,
  received_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
