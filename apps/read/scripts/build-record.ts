// PROD builder — runs on miso (cron). Reads the WebDAV-synced statistics.sqlite3 + the
// local Calibre library, resolves covers, and writes a static <out>/record.json +
// <out>/covers/<md5>.jpg that Caddy serves. No D1, no network except web cover fallback.
//
//   bun run scripts/build-record.ts --db <stats.sqlite3> --calibre <calibre-library> --out <webroot>
//
// Or as a self-contained arm64 binary (no runtime on miso):
//   bun build --compile --target=bun-linux-arm64 scripts/build-record.ts --outfile build-record
//   ./build-record --db /path/statistics.sqlite3 --calibre /path/calibre-library --out /path/site
//
// Covers already present in <out>/covers are kept (so the cron doesn't re-hit AniList/Google
// every run). Snapshot the DB before pointing --db at it — never read it mid-WebDAV-write.

import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { buildLedgerView } from "../shared/stats.ts";
import {
  booksFromStats,
  filterStatsRows,
  sessionsFromStats,
  type StatsBookRow,
  type StatsSessionRow,
} from "../shared/from-stats.ts";
import { matchCalibre, webCover, type CalBook, type KoBook } from "../shared/covers.ts";

const opt = (k: string, d: string): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const DB = opt("db", "");
const CALIBRE = opt("calibre", "");
const OUT = opt("out", "");
const dry = process.argv.includes("--dry");
if (!DB || !OUT) {
  console.error("usage: build-record --db <stats.sqlite3> --out <webroot> [--calibre <library>] [--dry]");
  process.exit(2);
}
const COVERS = `${OUT}/covers`;
if (!dry) mkdirSync(COVERS, { recursive: true });

// Before the first Kobo sync there's no stats DB — seed an empty view so the site shows
// the fresh-install state instead of a 404.
if (!existsSync(DB)) {
  const empty = buildLedgerView([], [], [], new Date());
  if (!dry) writeFileSync(`${OUT}/record.json`, JSON.stringify(empty));
  console.log(`no stats db at ${DB} — wrote empty record.json`);
  process.exit(0);
}

// ── KOReader stats ────────────────────────────────────────────────────────────
const sdb = new Database(DB, { readonly: true });
const bookRows = sdb
  .query<StatsBookRow, []>(
    `SELECT id,title,authors,series,language,pages,md5,last_open,total_read_time,total_read_pages FROM book`,
  )
  .all();
const sessionRows = sdb
  .query<StatsSessionRow, []>(`SELECT id_book,page,start_time,duration,total_pages FROM page_stat_data`)
  .all();
const filtered = filterStatsRows(bookRows, sessionRows);
const idToMd5 = new Map<number, string>(filtered.books.map((b) => [b.id, b.md5]));

// ── Calibre catalogue (local on miso) ──────────────────────────────────────────
let catalogue: CalBook[] = [];
if (CALIBRE && existsSync(`${CALIBRE}/metadata.db`)) {
  const cdb = new Database(`${CALIBRE}/metadata.db`, { readonly: true });
  catalogue = cdb
    .query<{ id: number; title: string; author: string; path: string; isbn: string | null }, []>(
      `SELECT b.id, b.title, b.author_sort AS author, b.path,
              (SELECT i.val FROM identifiers i WHERE i.book=b.id AND i.type='isbn' LIMIT 1) AS isbn
       FROM books b`,
    )
    .all()
    .map((r) => ({ id: r.id, title: r.title, author: r.author ?? "", path: r.path, isbn: r.isbn ?? "" }));
  cdb.close();
}

// ── Resolve covers ──────────────────────────────────────────────────────────────
const have = new Set<string>();
let fromCalibre = 0;
let fromWeb = 0;
for (const b of filtered.books) {
  const dest = `${COVERS}/${b.md5}.jpg`;
  if (existsSync(dest)) {
    have.add(b.md5);
    continue; // keep what we already pulled
  }
  const ko: KoBook = { md5: b.md5, title: b.title, authors: b.authors, isbn: null };
  const hit = catalogue.length ? matchCalibre(ko, catalogue) : null;
  if (hit) {
    const src = `${CALIBRE}/${hit.path}/cover.jpg`;
    if (existsSync(src)) {
      if (!dry) copyFileSync(src, dest);
      have.add(b.md5);
      fromCalibre++;
      continue;
    }
  }
  const w = dry ? null : await webCover(ko);
  if (w) {
    writeFileSync(dest, w.bytes);
    have.add(b.md5);
    fromWeb++;
  }
}

// ── Assemble + write the static view ─────────────────────────────────────────────
const books = booksFromStats(filtered.books, (md5) => (have.has(md5) ? `/covers/${md5}.jpg` : null));
const sessions = sessionsFromStats(filtered.sessions, idToMd5);
const view = buildLedgerView(books, sessions, [], new Date()); // no sidecars → no highlights

if (!dry) writeFileSync(`${OUT}/record.json`, JSON.stringify(view));
console.log(
  `books=${books.length} sessions=${sessions.length} covers=${have.size}` +
    ` (calibre +${fromCalibre}, web +${fromWeb})${dry ? " [dry]" : ` → ${OUT}/record.json`}`,
);
