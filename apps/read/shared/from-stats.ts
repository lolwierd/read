// Raw KOReader statistics.sqlite3 → @read/core domain rows. This is the WebDAV direction's
// "SQLite adapter": the built-in stats sync only ships statistics.sqlite3 (books +
// page_stat_data), so there are no sidecars — no highlights, no doc_props/ISBN. Progress
// and status are derived from pages read. Runtime-agnostic: callers pass already-fetched
// rows (so this works under bun:sqlite on miso and in the dev builder alike).

import { deriveStatus, normalizeAuthors, type Book, type Session } from "@read/core";

export interface StatsBookRow {
  id: number;
  title: string;
  authors: string | null;
  series: string | null;
  language: string | null;
  pages: number | null;
  md5: string;
  last_open: number | null;
  total_read_time: number | null;
  total_read_pages: number | null;
}

export interface StatsSessionRow {
  id_book: number;
  page: number;
  start_time: number;
  duration: number;
  total_pages: number;
}

const MIN_READ_SECONDS = 300;
const MIN_PROGRESS_RATIO = 0.05;
const MIN_SESSION_ROWS = 20;
const MIN_UNKNOWN_PAGE_PROGRESS = 20;

/** KOReader writes the literal "N/A" for missing authors/series (manga, fonts, etc.). */
const naToNull = (s: string | null): string | null => {
  const v = s?.trim();
  return !v || v.toUpperCase() === "N/A" ? null : v;
};

const num = (n: number | null): number => n ?? 0;

function hasMeaningfulProgress(b: StatsBookRow): boolean {
  const readPages = num(b.total_read_pages);
  if (b.pages !== null && b.pages > 0) return readPages / b.pages >= MIN_PROGRESS_RATIO;
  return readPages >= MIN_UNKNOWN_PAGE_PROGRESS;
}

/** Hide accidental KOReader stat rows (help docs, fonts, test opens) per
 *  FRONTEND-IGNORE-RULES.md: drop known junk titles, keep only rows with real activity.
 *  Manga is NOT dropped for missing authors. */
export function shouldShowStatsBook(b: StatsBookRow, sessionCount: number): boolean {
  const title = b.title.trim();
  if (title === "KOReader Quickstart Guide") return false;
  if (title.toLowerCase().includes("myscript")) return false;
  if (/^chapter\s+\d+$/i.test(title)) return false;
  return num(b.total_read_time) >= MIN_READ_SECONDS || hasMeaningfulProgress(b) || sessionCount >= MIN_SESSION_ROWS;
}

/** Apply the ignore filter to raw rows up-front: drop junk books and their sessions so no
 *  dashboard metric counts them. */
export function filterStatsRows(
  bookRows: StatsBookRow[],
  sessionRows: StatsSessionRow[],
): { books: StatsBookRow[]; sessions: StatsSessionRow[] } {
  const counts = new Map<number, number>();
  for (const s of sessionRows) counts.set(s.id_book, (counts.get(s.id_book) ?? 0) + 1);
  const keptIds = new Set<number>();
  const books = bookRows.filter((b) => {
    const ok = shouldShowStatsBook(b, counts.get(b.id) ?? 0);
    if (ok) keptIds.add(b.id);
    return ok;
  });
  return { books, sessions: sessionRows.filter((s) => keptIds.has(s.id_book)) };
}

/** Map stats `book` rows to core Books. `coverUrlFor` resolves a served cover URL (or null)
 *  for an md5 — the only piece that differs between dev and the miso builder. */
export function booksFromStats(rows: StatsBookRow[], coverUrlFor: (md5: string) => string | null): Book[] {
  return rows.map((r) => {
    const totalReadPages = num(r.total_read_pages);
    const percent = r.pages && r.pages > 0 ? Math.min(1, totalReadPages / r.pages) : 0;
    return {
      md5: r.md5,
      title: r.title.trim(),
      authors: naToNull(normalizeAuthors(r.authors)),
      series: naToNull(r.series),
      language: r.language?.trim() || null,
      isbn: null, // no doc_props in the stats DB
      pages: r.pages,
      percent_finished: percent,
      status: deriveStatus(null, percent),
      rating: null,
      review: null,
      last_open: r.last_open,
      total_read_time: num(r.total_read_time),
      total_read_pages: totalReadPages,
      current_chapter: null,
      cover_url: coverUrlFor(r.md5),
    };
  });
}

export function sessionsFromStats(rows: StatsSessionRow[], idToMd5: Map<number, string>): Session[] {
  return rows
    .map((r) => ({
      book_md5: idToMd5.get(r.id_book) ?? "",
      page: r.page,
      start_time: r.start_time,
      duration: r.duration,
      total_pages: r.total_pages,
    }))
    .filter((s) => s.book_md5 !== "");
}
