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
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { buildLedgerView } from "../shared/stats.ts";
import {
  booksFromStats,
  filterStatsRows,
  sessionsFromStats,
  type StatsBookRow,
  type StatsSessionRow,
} from "../shared/from-stats.ts";
import { matchCalibre, webCover, type CalBook, type KoBook } from "../shared/covers.ts";
import overrides from "../book-overrides.json";

const opt = (k: string, d: string): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const DB = opt("db", "");
const CALIBRE = opt("calibre", "");
const OUT = opt("out", "");
const HISTORY = opt("history", OUT ? `${OUT}/../finished-history.json` : "");
const dry = process.argv.includes("--dry");
if (!DB || !OUT) {
  console.error("usage: build-record --db <stats.sqlite3> --out <webroot> [--calibre <library>] [--dry]");
  process.exit(2);
}
const COVERS = `${OUT}/covers`;
if (!dry) {
  mkdirSync(COVERS, { recursive: true });
  mkdirSync(`${OUT}/years`, { recursive: true });
}

function writeJsonAtomic(path: string, value: unknown): void {
  if (dry) return;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, path);
}

// Before the first Kobo sync there's no stats DB — seed an empty view so the site shows
// the fresh-install state instead of a 404.
if (!existsSync(DB)) {
  const empty = buildLedgerView([], [], [], new Date());
  writeJsonAtomic(`${OUT}/record.json`, empty);
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
type BookOverride = {
  title?: string;
  authors?: string;
  series?: string;
  coverFrom?: string;
  force?: boolean;
  floors?: { totalReadTime?: number; totalReadPages?: number; lastOpen?: number };
  dayMinutes?: Record<string, number>;
};
const overrideMap = overrides as Record<string, BookOverride>;

// A metadata edit can make KOReader's three-way sync present an established book as a
// brand-new row. Explicitly forced books survive the accidental-open filter while their
// last known good totals act as monotonic floors.
for (const raw of bookRows) {
  const override = overrideMap[raw.md5];
  if (!override?.force || filtered.books.some((book) => book.md5 === raw.md5)) continue;
  filtered.books.push(raw);
  filtered.sessions.push(...sessionRows.filter((session) => session.id_book === raw.id));
}
const overriddenBooks = filtered.books.map((book) => {
  const override = overrideMap[book.md5];
  if (!override) return book;
  return {
    ...book,
    title: override.title ?? book.title,
    authors: override.authors ?? book.authors,
    series: override.series ?? book.series,
    total_read_time: Math.max(book.total_read_time ?? 0, override.floors?.totalReadTime ?? 0),
    total_read_pages: Math.max(book.total_read_pages ?? 0, override.floors?.totalReadPages ?? 0),
    last_open: Math.max(book.last_open ?? 0, override.floors?.lastOpen ?? 0) || null,
  };
});
filtered.books = overriddenBooks;
const idToMd5 = new Map<number, string>(filtered.books.map((b) => [b.id, b.md5]));

// ── Calibre catalogue (local on miso) ──────────────────────────────────────────
let catalogue: CalBook[] = [];
if (CALIBRE && existsSync(`${CALIBRE}/metadata.db`)) {
  const cdb = new Database(`${CALIBRE}/metadata.db`, { readonly: true });
  catalogue = cdb
    .query<{
      id: number; title: string; author: string; path: string; isbn: string | null;
      tags: string | null; publisher: string | null; published_year: string | null;
      series: string | null; series_index: number | null;
    }, []>(
      `SELECT b.id, b.title, b.author_sort AS author, b.path, b.series_index,
              (SELECT i.val FROM identifiers i WHERE i.book=b.id AND i.type='isbn' LIMIT 1) AS isbn
             ,(SELECT group_concat(t.name, '|||') FROM tags t JOIN books_tags_link l ON l.tag=t.id WHERE l.book=b.id) AS tags
             ,(SELECT p.name FROM publishers p JOIN books_publishers_link l ON l.publisher=p.id WHERE l.book=b.id LIMIT 1) AS publisher
             ,CAST(strftime('%Y', b.pubdate) AS TEXT) AS published_year
             ,(SELECT s.name FROM series s JOIN books_series_link l ON l.series=s.id WHERE l.book=b.id LIMIT 1) AS series
       FROM books b`,
    )
    .all()
    .map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author ?? "",
      path: r.path,
      isbn: r.isbn ?? "",
      tags: r.tags?.split("|||").filter(Boolean) ?? [],
      publisher: r.publisher,
      publishedYear: r.published_year ? Number(r.published_year) : null,
      series: r.series,
      seriesIndex: r.series_index,
    }));
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
const books = booksFromStats(filtered.books, (md5) => {
  const coverMd5 = overrideMap[md5]?.coverFrom ?? md5;
  return have.has(coverMd5) ? `/covers/${coverMd5}.jpg` : null;
}).map((book) => {
  const hit = catalogue.length
    ? matchCalibre({ md5: book.md5, title: book.title, authors: book.authors, isbn: book.isbn }, catalogue)
    : null;
  return hit
    ? {
        ...book,
        tags: hit.tags ?? [],
        publisher: hit.publisher ?? null,
        published_year: hit.publishedYear ?? null,
        series: book.series ?? hit.series ?? null,
        series_index: hit.seriesIndex ?? null,
      }
    : book;
});
const sessions = sessionsFromStats(filtered.sessions, idToMd5);
const view = buildLedgerView(books, sessions, [], new Date()); // no sidecars → no highlights

// Preserve exact daily totals observed before a destructive KOReader metadata sync. These
// are floors rather than additions, so a future healthy database naturally supersedes the
// correction without double counting it.
for (const [md5, override] of Object.entries(overrideMap)) {
  for (const [date, floor] of Object.entries(override.dayMinutes ?? {})) {
    const globalDay = view.extras.calendar.find((day) => day.date === date);
    const bookDay = view.extras.bookStats[md5]?.calendar.find((day) => day.date === date);
    const observed = bookDay?.minutes ?? 0;
    const delta = Math.max(0, floor - observed);
    if (delta === 0) continue;
    if (bookDay) bookDay.minutes += delta;
    if (globalDay) globalDay.minutes += delta;
    const weekDay = view.stats.week.find((day) => day.day === date);
    if (weekDay) weekDay.minutes += delta;
    const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
    view.extras.weekday[dayIndex] = (view.extras.weekday[dayIndex] ?? 0) + delta;
    const today = view.extras.calendar[view.extras.calendar.length - 1]?.date;
    if (today) {
      const age = Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${date}T12:00:00Z`).getTime()) / 86_400_000);
      if (age >= 0 && age <= 6) {
        view.extras.weekComparison.currentMinutes += delta;
        if (observed === 0) view.extras.weekComparison.activeDays += 1;
      } else if (age >= 7 && age <= 13) {
        view.extras.weekComparison.previousMinutes += delta;
        if (observed === 0) view.extras.weekComparison.previousActiveDays += 1;
      }
    }
  }
}
view.extras.calendarMax = Math.max(0, ...view.extras.calendar.map((day) => day.minutes));
view.stats.weekMinutes = view.stats.week.reduce((sum, day) => sum + day.minutes, 0);
view.stats.bestDay = view.stats.week.reduce((best, day) => !best || day.minutes > best.minutes ? day : best, null as typeof view.stats.bestDay);
const comparison = view.extras.weekComparison;
comparison.percentChange = comparison.previousMinutes > 0
  ? Math.round(((comparison.currentMinutes - comparison.previousMinutes) / comparison.previousMinutes) * 100)
  : null;

// Completion is an observed event, not the book's most recent open. Persist the first
// finished timestamp so reopening a completed book cannot move it into another year.
let finishedHistory: Record<string, number> = {};
if (HISTORY && existsSync(HISTORY)) {
  try { finishedHistory = JSON.parse(await Bun.file(HISTORY).text()) as Record<string, number>; }
  catch { console.warn(`could not read ${HISTORY}; rebuilding completion history`); }
}
for (const book of books) {
  if (book.status === "finished" && !finishedHistory[book.md5]) {
    finishedHistory[book.md5] = book.last_open ?? view.generatedAt;
  }
}
const currentYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
view.stats.booksThisYear = Object.values(finishedHistory).filter((epoch) =>
  new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(epoch * 1000)) === currentYear,
).length;

writeJsonAtomic(`${OUT}/record.json`, view);
writeJsonAtomic(`${OUT}/years/${currentYear}.json`, view);
if (HISTORY) writeJsonAtomic(HISTORY, finishedHistory);
console.log(
  `books=${books.length} sessions=${sessions.length} covers=${have.size}` +
    ` (calibre +${fromCalibre}, web +${fromWeb})${dry ? " [dry]" : ` → ${OUT}/record.json`}`,
);
