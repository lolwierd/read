-- Embedded book covers stored as BLOBs in D1 (no R2). The plugin uploads cover JPEGs
-- scaled to ~480px wide (tens of KB each) — well under D1's per-row size limit. Served
-- by read-web at /cover/:md5.

CREATE TABLE covers (
  md5          TEXT PRIMARY KEY REFERENCES books(md5) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  bytes        BLOB NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
