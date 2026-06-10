// Small, dependency-free formatters. The reading timezone matches @read/core (IST).
const TZ = "Asia/Kolkata";

/** 0 → "0m", 95 → "1h 35m", 600 → "10h". Compact, mono-friendly. */
export function hm(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/** Hours as a decimal already (e.g. 4.3) → "4.3". */
export function oneDp(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function group(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Unix seconds → "8 June 2026". */
export function longDate(epochSeconds: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(epochSeconds * 1000));
}

/** "2026-05-31" → "31 May ’26". */
export function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${day} ${month} ’${yr}`;
}

/** "2026-05-31" → "May". */
export function monthOf(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

/** Relative-ish freshness for the sync line. */
export function ago(epochSeconds: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor(now / 1000 - epochSeconds));
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** 14 → "2 o'clock"; for the reading-clock annotation. 12h with am/pm. */
export function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${ampm}`;
}
