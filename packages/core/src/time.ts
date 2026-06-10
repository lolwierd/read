// Time helpers. All day-bucketing happens in a fixed reading timezone (the Kobo's
// clock, IST) so "today", streaks and the week chart line up with lived days — not UTC.
// Pure + deterministic: callers pass the reference instant; nothing reads the wall clock.

export const READING_TZ = "Asia/Kolkata";

const DAY_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(tz: string): Intl.DateTimeFormat {
  let f = DAY_FMT_CACHE.get(tz);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    DAY_FMT_CACHE.set(tz, f);
  }
  return f;
}

/** Unix-seconds → "YYYY-MM-DD" in the given tz (en-CA yields ISO-ordered parts). */
export function dayInTz(epochSeconds: number, tz: string = READING_TZ): string {
  return dayFormatter(tz).format(new Date(epochSeconds * 1000));
}

/** A Date → "YYYY-MM-DD" in the given tz. */
export function todayInTz(now: Date, tz: string = READING_TZ): string {
  return dayFormatter(tz).format(now);
}

/** Add (or subtract) whole days to a "YYYY-MM-DD" string, returning the same shape. */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  // Anchor at noon UTC so DST / tz shifts never roll the date across a boundary.
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Short weekday label ("Mon") for a "YYYY-MM-DD" day. */
export function weekdayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  return WEEKDAYS[dt.getUTCDay()]!;
}

/** Parse a KOReader datetime ("YYYY-MM-DD HH:MM:SS", device-local) to unix seconds.
 *  We treat it as wall-clock in `tz`. Returns 0 on an unparseable string. */
export function parseKoDatetime(s: string, tz: string = READING_TZ): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (m === null) return 0;
  const [, Y, Mo, D, H, Mi, S] = m.map(Number) as unknown as number[];
  // Build the instant as if the wall-clock were UTC, then correct by the tz offset at
  // that instant. Good to the second for any fixed-offset or DST-correct zone.
  const asUtc = Date.UTC(Y!, Mo! - 1, D!, H!, Mi!, S!);
  const offsetMs = tzOffsetMs(asUtc, tz);
  return Math.floor((asUtc - offsetMs) / 1000);
}

/** Offset (ms) of `tz` from UTC at the given instant — positive east of UTC. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit "24" at midnight
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asIfUtc - utcMs;
}
