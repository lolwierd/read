// Ledger-specific rollups layered on top of @read/core's RecordView. Pure functions over
// the same Session/Book domain types, so the dev fixture builder and the prod D1 worker
// produce byte-identical numbers. Everything tz-aware in the reading timezone.

import {
  buildRecordView,
  dayInTz,
  READING_TZ,
  type Annotation,
  type Book,
  type RecordView,
  type Session,
} from "@read/core";

export interface CalendarDay {
  date: string; // YYYY-MM-DD (reading tz)
  minutes: number;
}

/** Per-book reading detail, surfaced when a book is opened from the shelf / in-hand strip. */
export interface BookStat {
  minutes: number; // total minutes in this book
  days: number; // distinct days it was read
  firstDay: string | null;
  lastDay: string | null;
  trend: number[]; // minutes/day over the trailing 21 days
}

export interface LedgerExtras {
  totalHours: number; // lifetime read time, 1dp
  totalPages: number; // sum of total_read_pages across books
  totalSessions: number; // count of page_stat_data rows
  booksTracked: number;
  booksFinished: number;
  highlights: number;
  longestSession: number; // minutes, single sitting (one start_time row)
  avgSession: number; // minutes per session, 1dp
  firstDay: string | null; // earliest reading day
  calendar: CalendarDay[]; // trailing 53 weeks ending today, one entry per day
  calendarMax: number; // busiest day in the window (minutes) — for scaling
  timeOfDay: number[]; // 24 buckets, minutes read per hour-of-day
  peakHour: number | null; // hour 0..23 with the most reading
  nowTrend: number[]; // current book: minutes/day over the trailing 14 days
  bookStats: Record<string, BookStat>; // per-book detail, keyed by md5
  weekday: number[]; // 7 buckets (Sun..Sat) of minutes read per day-of-week
  busiestDow: number | null; // day-of-week (0=Sun) you read most
  longestStreak: number; // longest run of consecutive reading days, ever
  sittings: { count: number; longest: number; avg: number }; // real sittings (gap-clustered), minutes
  today: {
    minutes: number;
    pages: number; // distinct pages turned today
    books: number; // books touched today
    sittings: number; // gap-clustered sittings today
    longestSitting: number; // minutes
    firstAt: string | null; // first opened today, e.g. "6:12 AM"
    lastAt: string | null; // last read today
  };
}

/** Clock time ("6:12 AM") of a unix instant in the reading tz. */
function clockInTz(epochSeconds: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(new Date(epochSeconds * 1000));
}

export interface LedgerView extends RecordView {
  extras: LedgerExtras;
  generatedAt: number; // unix seconds
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Hour-of-day (0..23) for a unix-seconds instant, in the reading timezone. */
function hourInTz(epochSeconds: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date(epochSeconds * 1000));
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(h) % 24;
}

/** Step a YYYY-MM-DD date string by ±days using UTC noon (DST-safe for date math). */
function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Day-of-week (0=Sun..6=Sat) of a YYYY-MM-DD date string. */
const dowOf = (ymd: string): number => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/** Longest run of consecutive days in a set of YYYY-MM-DD strings. */
function longestRun(days: Set<string>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue; // only start from run-beginnings
    let len = 1;
    while (days.has(addDays(d, len))) len++;
    if (len > best) best = len;
  }
  return best;
}

/** Cluster page events into real sittings: a gap larger than GAP starts a new sitting. */
function clusterSittings(sessions: Session[]): { count: number; longest: number; avg: number } {
  const GAP = 25 * 60; // seconds — a >25min pause ends a sitting
  const sorted = sessions.slice().sort((a, b) => a.start_time - b.start_time);
  const lengths: number[] = [];
  let cur = 0;
  let prev = -Infinity;
  for (const s of sorted) {
    if (s.start_time - prev > GAP && cur > 0) {
      lengths.push(cur);
      cur = 0;
    }
    cur += s.duration;
    prev = s.start_time;
  }
  if (cur > 0) lengths.push(cur);
  if (lengths.length === 0) return { count: 0, longest: 0, avg: 0 };
  const total = lengths.reduce((a, b) => a + b, 0);
  return {
    count: lengths.length,
    longest: Math.round(Math.max(...lengths) / 60),
    avg: Math.round(total / lengths.length / 60),
  };
}

export function computeExtras(
  books: Book[],
  sessions: Session[],
  annotations: Annotation[],
  now: Date,
  tz: string = READING_TZ,
): LedgerExtras {
  const today = dayInTz(Math.floor(now.getTime() / 1000), tz);

  // Per-day minutes (whole library) + time-of-day histogram, single pass.
  const minutesByDay = new Map<string, number>();
  const timeOfDay = new Array<number>(24).fill(0);
  let longestSec = 0;
  let firstDay: string | null = null;
  for (const s of sessions) {
    const day = dayInTz(s.start_time, tz);
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + s.duration / 60);
    const hr = hourInTz(s.start_time, tz);
    timeOfDay[hr] = (timeOfDay[hr] ?? 0) + s.duration / 60;
    if (s.duration > longestSec) longestSec = s.duration;
    if (firstDay === null || day < firstDay) firstDay = day;
  }

  // Trailing 53 weeks, aligned so the last column ends today. Walk back to the most
  // recent Sunday-or-today, then 53*7 days back, filling each day from minutesByDay.
  const SPAN = 53 * 7;
  const calendar: CalendarDay[] = [];
  let calendarMax = 0;
  const start = addDays(today, -(SPAN - 1));
  for (let i = 0; i < SPAN; i++) {
    const date = addDays(start, i);
    const minutes = Math.round(minutesByDay.get(date) ?? 0);
    if (minutes > calendarMax) calendarMax = minutes;
    calendar.push({ date, minutes });
  }

  const timeOfDayRounded = timeOfDay.map((m) => Math.round(m));
  const peakIdx = timeOfDayRounded.reduce((best, m, i) => (m > timeOfDayRounded[best]! ? i : best), 0);
  const peakHour = timeOfDayRounded[peakIdx]! > 0 ? peakIdx : null;

  // Trailing 14-day minutes for the book currently in hand (for the hero sparkline).
  const current = books
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.last_open ?? 0) - (a.last_open ?? 0))[0];
  const nowTrend: number[] = [];
  if (current) {
    const perDay = new Map<string, number>();
    for (const s of sessions) {
      if (s.book_md5 !== current.md5) continue;
      const day = dayInTz(s.start_time, tz);
      perDay.set(day, (perDay.get(day) ?? 0) + s.duration / 60);
    }
    for (let i = 13; i >= 0; i--) nowTrend.push(Math.round(perDay.get(addDays(today, -i)) ?? 0));
  }

  // Per-book detail for the click-through modal: minutes, distinct days, span, 21-day trend.
  const perBook = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    const day = dayInTz(s.start_time, tz);
    let m = perBook.get(s.book_md5);
    if (!m) perBook.set(s.book_md5, (m = new Map()));
    m.set(day, (m.get(day) ?? 0) + s.duration / 60);
  }
  const bookStats: Record<string, BookStat> = {};
  for (const [md5, perDay] of perBook) {
    const days = [...perDay.keys()].sort();
    const trend: number[] = [];
    for (let i = 20; i >= 0; i--) trend.push(Math.round(perDay.get(addDays(today, -i)) ?? 0));
    bookStats[md5] = {
      minutes: Math.round([...perDay.values()].reduce((a, b) => a + b, 0)),
      days: perDay.size,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
      trend,
    };
  }

  // Day-of-week rhythm, longest streak, real sittings.
  const weekday = new Array<number>(7).fill(0);
  for (const [day, mins] of minutesByDay) {
    const d = dowOf(day);
    weekday[d] = (weekday[d] ?? 0) + mins;
  }
  const weekdayRounded = weekday.map((m) => Math.round(m));
  const busiestIdx = weekdayRounded.reduce((best, m, i) => (m > weekdayRounded[best]! ? i : best), 0);
  const busiestDow = weekdayRounded[busiestIdx]! > 0 ? busiestIdx : null;
  const longestStreak = longestRun(new Set(minutesByDay.keys()));
  const sittings = clusterSittings(sessions);

  // Today.
  const todaySessions = sessions.filter((s) => dayInTz(s.start_time, tz) === today);
  const todaySit = clusterSittings(todaySessions);
  const todayTimes = todaySessions.map((s) => s.start_time);
  const today_ = {
    minutes: Math.round(todaySessions.reduce((a, s) => a + s.duration, 0) / 60),
    pages: new Set(todaySessions.map((s) => `${s.book_md5}#${s.page}`)).size,
    books: new Set(todaySessions.map((s) => s.book_md5)).size,
    sittings: todaySit.count,
    longestSitting: todaySit.longest,
    firstAt: todayTimes.length ? clockInTz(Math.min(...todayTimes), tz) : null,
    lastAt: todayTimes.length ? clockInTz(Math.max(...todayTimes), tz) : null,
  };

  return {
    totalHours: round1(books.reduce((s, b) => s + b.total_read_time, 0) / 3600),
    totalPages: books.reduce((s, b) => s + b.total_read_pages, 0),
    totalSessions: sessions.length,
    booksTracked: books.length,
    booksFinished: books.filter((b) => b.status === "finished").length,
    highlights: annotations.length,
    longestSession: Math.round(longestSec / 60),
    avgSession: sessions.length ? round1(sessions.reduce((s, x) => s + x.duration, 0) / 60 / sessions.length) : 0,
    firstDay,
    calendar,
    calendarMax,
    timeOfDay: timeOfDayRounded,
    peakHour,
    nowTrend,
    bookStats,
    weekday: weekdayRounded,
    busiestDow,
    longestStreak,
    sittings,
    today: today_,
  };
}

/** Full ledger payload: core RecordView + ledger extras. One source of truth. */
export function buildLedgerView(
  books: Book[],
  sessions: Session[],
  annotations: Annotation[],
  now: Date,
  tz: string = READING_TZ,
): LedgerView {
  return {
    ...buildRecordView(books, sessions, annotations, now, tz),
    extras: computeExtras(books, sessions, annotations, now, tz),
    generatedAt: Math.floor(now.getTime() / 1000),
  };
}
