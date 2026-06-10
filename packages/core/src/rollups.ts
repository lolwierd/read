// View rollups — pure functions that turn stored rows into everything "The Reading
// Record" renders. Both read-web (SSR) and read-mcp (reading_stats tool) call these, so
// the dashboard and Claude always agree to the number. No I/O, no wall-clock reads.

import type {
  Annotation,
  Book,
  BookStatus,
  BookView,
  HighlightView,
  ReadingStats,
  RecordView,
  Session,
  WeekDay,
} from "./types.js";
import { spineColor, coverUrlForIsbn } from "./covers.js";
import { addDays, dayInTz, READING_TZ, todayInTz, weekdayLabel } from "./time.js";

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Reading",
  finished: "Finished",
  paused: "Paused",
  abandoned: "Set aside",
  unread: "Up next",
};

export function statusLabel(status: BookStatus): string {
  return STATUS_LABEL[status];
}

export function toBookView(book: Book): BookView {
  return {
    md5: book.md5,
    title: book.title,
    author: book.authors,
    series: book.series,
    isbn: book.isbn,
    status: book.status,
    statusLabel: statusLabel(book.status),
    percent: Math.round(book.percent_finished * 100),
    pages: book.pages,
    hoursInBook: Math.round(book.total_read_time / 360) / 10, // seconds → hours, 1dp
    rating: book.rating,
    coverUrl: book.cover_url ?? coverUrlForIsbn(book.isbn),
    coverFallback: spineColor(book.md5),
    currentChapter: book.current_chapter,
    lastOpen: book.last_open,
  };
}

/** Minutes read on a specific day (device tz), rounded to the nearest minute. */
export function minutesOnDay(sessions: Session[], day: string, tz: string = READING_TZ): number {
  let secs = 0;
  for (const s of sessions) {
    if (dayInTz(s.start_time, tz) === day) secs += s.duration;
  }
  return Math.round(secs / 60);
}

/** The trailing 7-day window ending on `today` (inclusive), oldest → newest. */
export function buildWeek(sessions: Session[], today: string, tz: string = READING_TZ): WeekDay[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const d = dayInTz(s.start_time, tz);
    byDay.set(d, (byDay.get(d) ?? 0) + s.duration);
  }
  const out: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({
      day,
      label: weekdayLabel(day),
      minutes: Math.round((byDay.get(day) ?? 0) / 60),
      today: i === 0,
    });
  }
  return out;
}

/** Consecutive days with any reading, ending at `today`. If nothing has been read yet
 *  today the streak is measured to yesterday (a fresh day doesn't break a live streak
 *  until it ends). Returns 0 when neither today nor yesterday saw any reading. */
export function streakDays(sessions: Session[], today: string, tz: string = READING_TZ): number {
  const active = new Set<string>();
  for (const s of sessions) {
    if (s.duration > 0) active.add(dayInTz(s.start_time, tz));
  }
  if (active.size === 0) return 0;
  // Anchor at today if read today, else yesterday (grace), else the streak is dead.
  let cursor: string;
  if (active.has(today)) cursor = today;
  else if (active.has(addDays(today, -1))) cursor = addDays(today, -1);
  else return 0;
  let n = 0;
  while (active.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Books finished within a calendar year (device tz), inferred from last_open. */
export function booksFinishedInYear(books: Book[], year: number, tz: string = READING_TZ): number {
  let n = 0;
  for (const b of books) {
    if (b.status !== "finished") continue;
    if (b.last_open === null) continue;
    if (Number(dayInTz(b.last_open, tz).slice(0, 4)) === year) n++;
  }
  return n;
}

/** Recent meaningful highlights, newest first. */
export function recentHighlights(
  annotations: Annotation[],
  booksByMd5: Map<string, Book>,
  limit = 4,
): HighlightView[] {
  return annotations
    .filter((a) => (a.text !== null && a.text !== "") || (a.note !== null && a.note !== ""))
    .slice()
    .sort((a, b) => b.datetime_epoch - a.datetime_epoch)
    .slice(0, limit)
    .map((a) => toHighlightView(a, booksByMd5));
}

/** Pull-quote candidates: highlighted lines of a pleasing length (not a stray word, not
 *  a whole paragraph), newest first. */
export function pullQuotes(
  annotations: Annotation[],
  booksByMd5: Map<string, Book>,
  limit = 8,
): HighlightView[] {
  return annotations
    .filter((a) => a.text !== null && a.text.length >= 24 && a.text.length <= 240)
    .slice()
    .sort((a, b) => b.datetime_epoch - a.datetime_epoch)
    .slice(0, limit)
    .map((a) => toHighlightView(a, booksByMd5));
}

function toHighlightView(a: Annotation, booksByMd5: Map<string, Book>): HighlightView {
  return {
    bookMd5: a.book_md5,
    bookTitle: booksByMd5.get(a.book_md5)?.title ?? "Unknown",
    text: a.text ?? a.note ?? "",
    note: a.note,
    chapter: a.chapter,
    page: a.page,
    datetime: a.datetime,
    datetimeEpoch: a.datetime_epoch,
  };
}

/** Order the shelf: the book in hand first, then most-recently-opened. */
export function shelfOrder(books: Book[]): Book[] {
  return books.slice().sort((a, b) => {
    const ar = a.status === "reading" ? 1 : 0;
    const br = b.status === "reading" ? 1 : 0;
    if (ar !== br) return br - ar;
    return (b.last_open ?? 0) - (a.last_open ?? 0);
  });
}

/** The book in hand: the most-recently-opened book still being read. */
export function nowReading(books: Book[]): Book | null {
  const reading = books
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.last_open ?? 0) - (a.last_open ?? 0));
  return reading[0] ?? null;
}

/** Assemble the full front-page view. `now` is the reference instant (for "today"). */
export function buildRecordView(
  books: Book[],
  sessions: Session[],
  annotations: Annotation[],
  now: Date,
  tz: string = READING_TZ,
): RecordView {
  const today = todayInTz(now, tz);
  const booksByMd5 = new Map(books.map((b) => [b.md5, b]));
  const week = buildWeek(sessions, today, tz);
  const bestDay = week.reduce<WeekDay | null>(
    (best, d) => (best === null || d.minutes > best.minutes ? d : best),
    null,
  );
  const current = nowReading(books);

  const stats: ReadingStats = {
    minutesToday: minutesOnDay(sessions, today, tz),
    streakDays: streakDays(sessions, today, tz),
    weekMinutes: week.reduce((sum, d) => sum + d.minutes, 0),
    bestDay: bestDay !== null && bestDay.minutes > 0 ? bestDay : null,
    booksThisYear: booksFinishedInYear(books, Number(today.slice(0, 4)), tz),
    linesKept: annotations.length,
    week,
  };

  return {
    now: current !== null ? toBookView(current) : null,
    stats,
    shelf: shelfOrder(books).map(toBookView),
    margins: recentHighlights(annotations, booksByMd5),
    pullQuotes: pullQuotes(annotations, booksByMd5),
  };
}
