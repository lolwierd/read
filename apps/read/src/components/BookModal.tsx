import { useEffect, useId, useMemo, useRef } from "react";
import type { LedgerView } from "../lib/view";
import { group, hm, hourLabel, oneDp, shortDate } from "../lib/format";
import { Cover } from "./Cover";
import { statusTone } from "../lib/view";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function finishRange(pages: number, read: number, trend: number[], generatedAt: number): string | null {
  const remaining = pages - read;
  if (remaining <= 0) return null;
  const pace14 = trend.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const pace30 = trend.reduce((a, b) => a + b, 0) / 30;
  const paces = [pace14, pace30].filter((pace) => pace >= 0.25);
  if (!paces.length) return null;
  const quick = Math.max(...paces) * 1.15;
  const slow = Math.min(...paces) * 0.85;
  const earliest = Math.ceil(remaining / quick);
  const latest = Math.ceil(remaining / slow);
  if (latest > 3650) return null;
  const from = DATE.format(new Date((generatedAt + earliest * 86400) * 1000));
  const to = DATE.format(new Date((generatedAt + latest * 86400) * 1000));
  return from === to ? from : `${from} – ${to}`;
}

export function BookModal({ view, md5, onClose }: { view: LedgerView; md5: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!md5) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus.current?.focus();
    };
  }, [md5, onClose]);

  const book = md5 ? view.shelf.find((candidate) => candidate.md5 === md5) : null;
  const s = md5 ? view.extras.bookStats[md5] : undefined;
  const portrait = useMemo(() => {
    if (!book || !s) return null;
    const pagesRead = book.pages ? Math.round((book.percent / 100) * book.pages) : null;
    const pace = book.hoursInBook > 0 && pagesRead !== null ? Math.round(pagesRead / book.hoursInBook) : null;
    const eta = book.status === "reading" && book.pages && pagesRead !== null
      ? finishRange(book.pages, pagesRead, s.pagesTrend, view.generatedAt)
      : null;
    const peak = s.timeOfDay.reduce((best, minutes, hour) => minutes > s.timeOfDay[best]! ? hour : best, 0);
    const momentum = s.previousMinutes > 0 ? Math.round(((s.recentMinutes - s.previousMinutes) / s.previousMinutes) * 100) : null;
    return { pagesRead, pace, eta, peak: s.timeOfDay[peak] ? peak : null, momentum };
  }, [book, s, view.generatedAt]);

  if (!md5 || !book || !s || !portrait) return null;
  const calendarMax = Math.max(1, ...s.calendar.map((d) => d.minutes));
  const bandMax = Math.max(1, ...s.sittingBands);
  const stats: Array<[string, string, string?]> = [
    ["Hours", oneDp(book.hoursInBook), "in this book"],
    ["Days read", String(s.days), s.firstDay ? `since ${shortDate(s.firstDay)}` : ""],
    ["Typical sitting", hm(s.sittings.avg), `${s.sittings.count} in all`],
  ];
  if (portrait.pace !== null) stats.push(["Pace", String(portrait.pace), "pages an hour"]);
  if (s.latestReturnGap >= 2) stats.push(["Returned after", `${s.latestReturnGap}d`, `longest gap ${s.longestGap}d`]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="modal-x" onClick={onClose} aria-label="Close book portrait" autoFocus>✕</button>
        <div className="modal-head">
          <div className="modal-cover"><Cover book={book} big /></div>
          <div className="modal-head-text">
            <span className="pill" style={{ background: statusTone(book.status) }}>{book.statusLabel}</span>
            <h3 id={titleId}>{book.title}</h3>
            <div className="byline">{book.author ?? "Unknown hand"}</div>
            {book.series ? <div className="modal-series">{book.series}{book.seriesIndex ? ` · ${book.seriesIndex}` : ""}</div> : null}
            <div className="modal-progress">
              <div className="meter" role="progressbar" aria-label="Book progress" aria-valuenow={book.percent} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.max(2, book.percent)}%` }} />
              </div>
              <div className="modal-progress-row">
                <b>{book.percent}%</b>
                {portrait.pagesRead !== null ? <span>{group(portrait.pagesRead)} / {group(book.pages!)} pp</span> : null}
              </div>
            </div>
            {portrait.eta ? <div className="modal-eta">At the recent rhythm, somewhere around <b>{portrait.eta}</b>.</div> : null}
            {(book.tags.length || book.publisher || book.publishedYear) ? (
              <div className="book-meta">
                {[...book.tags.slice(0, 4), book.publisher, book.publishedYear?.toString()].filter(Boolean).map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="modal-stats">
          {stats.map(([label, value, sub]) => <div key={label} className="ms"><div className="l">{label}</div><div className="v">{value}</div>{sub ? <div className="sub">{sub}</div> : null}</div>)}
        </div>

        <div className="portrait-grid">
          <div className="portrait-block book-calendar">
            <div className="portrait-title"><span>Reading days</span><b>last 12 weeks</b></div>
            <div className="book-calendar-grid">
              {s.calendar.map((day) => {
                const level = day.minutes ? Math.max(0.2, day.minutes / calendarMax) : 0;
                return <button key={day.date} style={{ opacity: day.minutes ? 0.35 + level * 0.65 : 0.12 }} aria-label={`${shortDate(day.date)}, ${day.minutes ? hm(day.minutes) : "nothing read"}`} title={`${shortDate(day.date)} · ${day.minutes ? hm(day.minutes) : "nothing read"}`} />;
              })}
            </div>
          </div>
          <div className="portrait-block portrait-rhythm">
            <div className="portrait-title"><span>Reading fingerprint</span><b>{portrait.peak !== null ? `most around ${hourLabel(portrait.peak)}` : "still forming"}</b></div>
            <div className="fingerprint">
              {s.timeOfDay.map((minutes, hour) => <i key={hour} title={`${hourLabel(hour)} · ${hm(minutes)}`} style={{ height: `${Math.max(3, (minutes / Math.max(1, ...s.timeOfDay)) * 100)}%` }} />)}
            </div>
          </div>
        </div>

        <div className="portrait-block sitting-shape">
          <div className="portrait-title"><span>Shape of a sitting</span><b>longest {hm(s.sittings.longest)}</b></div>
          <div className="sitting-bands">
            {[["under 15m", s.sittingBands[0]], ["15–30m", s.sittingBands[1]], ["30–60m", s.sittingBands[2]], ["over 1h", s.sittingBands[3]]].map(([label, count]) => (
              <div key={String(label)}><span>{label}</span><i><b style={{ width: `${(Number(count) / bandMax) * 100}%` }} /></i><em>{count}</em></div>
            ))}
          </div>
        </div>

        <div className="momentum-line">
          <span>last 30 days · {hm(s.recentMinutes)}</span>
          <b>{portrait.momentum === null ? "first comparison" : `${Math.abs(portrait.momentum)}% ${portrait.momentum >= 0 ? "more" : "less"} than the 30 before`}</b>
        </div>
      </div>
    </div>
  );
}
