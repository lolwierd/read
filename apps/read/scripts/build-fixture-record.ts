// Dev-only: turn the real KOReader statistics.sqlite3 fixture into the LedgerView JSON the
// SPA fetches in `vite dev`. Same adapter (shared/from-stats) the prod miso builder uses,
// so dev and prod agree. Covers: any md5 with a file in public/covers/<md5>.jpg (pulled
// from Calibre via sync-calibre-covers) gets that URL. `--empty` previews the fresh state.
//
//   bun run scripts/build-fixture-record.ts            # real fixture data
//   bun run scripts/build-fixture-record.ts --empty    # zero-data / fresh-install preview

import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { parseKoDatetime, type Annotation } from "@read/core";
import { buildLedgerView } from "../shared/stats.ts";
import {
  booksFromStats,
  filterStatsRows,
  sessionsFromStats,
  type StatsBookRow,
  type StatsSessionRow,
} from "../shared/from-stats.ts";

const HERE = new URL(".", import.meta.url).pathname;
const DB_PATH = `${HERE}../../../fixtures/real/statistics.sqlite3`;
const COVERS_DIR = `${HERE}../public/covers`;
const OUT = `${HERE}../public/record.dev.json`;

const db = new Database(DB_PATH, { readonly: true });
const bookRows = db
  .query<StatsBookRow, []>(
    `SELECT id,title,authors,series,language,pages,md5,last_open,total_read_time,total_read_pages FROM book`,
  )
  .all();
const sessionRows = db
  .query<StatsSessionRow, []>(`SELECT id_book,page,start_time,duration,total_pages FROM page_stat_data`)
  .all();
const filtered = filterStatsRows(bookRows, sessionRows);
const idToMd5 = new Map<number, string>(filtered.books.map((b) => [b.id, b.md5]));

const books = booksFromStats(filtered.books, (md5) =>
  existsSync(`${COVERS_DIR}/${md5}.jpg`) ? `/covers/${md5}.jpg` : null,
);
const sessions = sessionsFromStats(filtered.sessions, idToMd5);

// Real highlights need .sdr sidecars (absent from the stats DB). DEV-only sample so the
// Margins section has something to design against — sourced, public-domain, from books read.
const SAMPLE: Array<{ md5: string; text: string; chapter: string; when: string }> = [
  {
    md5: "50f46373927efbffb4393e82f54cbf89",
    text: "Knowledge can be communicated, but not wisdom. One can find it, live it, be fortified by it, do wonders through it, but one cannot communicate and teach it.",
    chapter: "Govinda",
    when: "2026-06-01 22:41:03",
  },
  {
    md5: "9f1a969f7055f12d52dc21f4d2fd4bc5",
    text: "I opened myself to the gentle indifference of the world. Finding it so much like myself—so like a brother, really—I felt that I had been happy and that I was happy again.",
    chapter: "Part Two, V",
    when: "2026-06-02 06:18:40",
  },
];
const sampleMd5s = new Set(books.map((b) => b.md5));
const annotations: Annotation[] = (process.argv.includes("--empty") ? [] : SAMPLE)
  .filter((s) => sampleMd5s.has(s.md5))
  .map((s) => ({
    book_md5: s.md5,
    datetime: s.when,
    datetime_epoch: parseKoDatetime(s.when),
    chapter: s.chapter,
    page: null,
    text: s.text,
    note: null,
    color: "yellow",
    pos0: "",
    pos1: null,
  }));

const empty = process.argv.includes("--empty");
// `--now <ISO>` overrides "now" for dev (e.g. to preview a day that has data in the fixture).
const nowArg = process.argv[process.argv.indexOf("--now") + 1];
const now = process.argv.includes("--now") && nowArg ? new Date(nowArg) : new Date();
const view = empty
  ? buildLedgerView([], [], [], now)
  : buildLedgerView(books, sessions, annotations, now);
await Bun.write(OUT, JSON.stringify(view, null, 2));
console.log(
  `wrote ${OUT}\n  books=${empty ? 0 : books.length} sessions=${empty ? 0 : sessions.length}` +
    ` covers=${books.filter((b) => b.cover_url).length} now="${view.now?.title ?? "—"}"`,
);
