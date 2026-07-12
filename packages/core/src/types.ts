// Domain types — the single shape both Workers (mcp + web) and the ingest path agree on.
// Storage rows mirror migrations/0001_init.sql; view types are computed in rollups.ts.

export type BookStatus = "unread" | "reading" | "finished" | "paused" | "abandoned";

/** A book as stored — one row per KOReader content md5. */
export interface Book {
  md5: string;
  title: string;
  authors: string | null;
  series: string | null;
  language: string | null;
  isbn: string | null;
  pages: number | null;
  percent_finished: number; // 0..1
  status: BookStatus;
  rating: number | null; // 0..5
  review: string | null;
  last_open: number | null; // unix seconds
  total_read_time: number; // seconds
  total_read_pages: number;
  current_chapter: string | null;
  cover_url: string | null;
  /** Optional Calibre enrichment. The KOReader statistics DB does not carry these. */
  tags?: string[];
  publisher?: string | null;
  published_year?: number | null;
  series_index?: number | null;
}

/** One reading session (a KOReader page_stat_data row). */
export interface Session {
  book_md5: string;
  page: number;
  start_time: number; // unix seconds (UTC)
  duration: number; // seconds
  total_pages: number;
}

/** One highlight/annotation from a `.sdr` sidecar. */
export interface Annotation {
  book_md5: string;
  datetime: string; // "YYYY-MM-DD HH:MM:SS" (device-local)
  datetime_epoch: number; // parsed, device tz
  chapter: string | null;
  page: number | null;
  text: string | null; // highlighted source
  note: string | null; // user's note
  color: string | null;
  pos0: string | null;
  pos1: string | null;
}

// ── View types (computed, never stored) ──────────────────────────────────────

/** One bar in "The Week". */
export interface WeekDay {
  day: string; // YYYY-MM-DD
  label: string; // Mon, Tue, …
  minutes: number;
  today: boolean;
}

/** A book as rendered on the shelf / lead. */
export interface BookView {
  md5: string;
  title: string;
  author: string | null;
  series: string | null;
  isbn: string | null;
  status: BookStatus;
  statusLabel: string; // "Reading", "Finished", "Paused", "Set aside", "Up next"
  percent: number; // 0..100, rounded
  pages: number | null;
  hoursInBook: number; // total_read_time → hours, 1dp
  rating: number | null;
  coverUrl: string | null;
  coverFallback: string; // CSS colour var for the clothbound spine
  currentChapter: string | null;
  lastOpen: number | null;
  tags: string[];
  publisher: string | null;
  publishedYear: number | null;
  seriesIndex: number | null;
}

/** A highlight as rendered in "From the Margins" / pull quote. */
export interface HighlightView {
  bookMd5: string;
  bookTitle: string;
  text: string;
  note: string | null;
  chapter: string | null;
  page: number | null;
  datetime: string;
  datetimeEpoch: number;
}

export interface ReadingStats {
  minutesToday: number;
  streakDays: number;
  weekMinutes: number; // sum of the 7-day window
  bestDay: WeekDay | null;
  booksThisYear: number;
  linesKept: number; // total annotations
  week: WeekDay[];
}

/** Everything "The Reading Record" front page needs. */
export interface RecordView {
  now: BookView | null; // the book in hand
  stats: ReadingStats;
  shelf: BookView[];
  margins: HighlightView[]; // recent highlights
  pullQuotes: HighlightView[]; // rotation candidates
}
