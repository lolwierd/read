import { useEffect } from "react";
import type { LedgerView } from "../lib/view";
import { group, hm, oneDp, shortDate } from "../lib/format";
import { Cover } from "./Cover";
import { statusTone } from "../lib/view";

export function BookModal({ view, md5, onClose }: { view: LedgerView; md5: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!md5) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [md5, onClose]);

  if (!md5) return null;
  const book = view.shelf.find((b) => b.md5 === md5);
  if (!book) return null;
  const s = view.extras.bookStats[md5];
  const trend = s?.trend ?? [];
  const max = Math.max(1, ...trend);
  const pagesRead = book.pages ? Math.round((book.percent / 100) * book.pages) : null;
  const pace = book.hoursInBook > 0 && pagesRead != null ? Math.round(pagesRead / book.hoursInBook) : null;

  // Finish estimate from recent pace (pages/day over the days actually read).
  let eta: string | null = null;
  if (book.status === "reading" && book.pages && pagesRead != null && s && s.days > 0) {
    const remaining = book.pages - pagesRead;
    const perDay = pagesRead / s.days;
    const days = perDay > 0 ? Math.ceil(remaining / perDay) : Infinity;
    if (remaining > 0 && days > 0 && days <= 3650) {
      const d = new Date((view.generatedAt + days * 86400) * 1000);
      eta = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(d);
    }
  }

  const stats: Array<[string, string, string?]> = [
    ["Hours", oneDp(book.hoursInBook), "in this book"],
    ["Days read", String(s?.days ?? 0), s?.firstDay ? `since ${shortDate(s.firstDay)}` : ""],
  ];
  if (pace != null) stats.push(["Pace", `${pace}`, "pages an hour"]);
  if (pagesRead != null) stats.push(["Pages", `${group(pagesRead)}`, `of ${group(book.pages!)}`]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={book.title}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="modal-head">
          <div className="modal-cover">
            <Cover book={book} big />
          </div>
          <div className="modal-head-text">
            <span className="pill" style={{ background: statusTone(book.status) }}>
              {book.statusLabel}
            </span>
            <h3>{book.title}</h3>
            <div className="byline">{book.author ?? "Unknown hand"}</div>
            {book.series ? <div className="modal-series">{book.series}</div> : null}

            <div className="modal-progress">
              <div className="meter">
                <span style={{ width: `${Math.max(2, book.percent)}%` }} />
              </div>
              <div className="modal-progress-row">
                <b>{book.percent}%</b>
                {pagesRead != null ? <span>{group(pagesRead)} / {group(book.pages!)} pp</span> : null}
              </div>
            </div>

            {eta ? (
              <div className="modal-eta">
                On pace to finish around <b>{eta}</b>
              </div>
            ) : null}
          </div>
        </div>

        <div className="modal-stats">
          {stats.map(([l, v, sub]) => (
            <div key={l} className="ms">
              <div className="l">{l}</div>
              <div className="v">{v}</div>
              {sub ? <div className="sub">{sub}</div> : null}
            </div>
          ))}
        </div>

        {trend.some((x) => x > 0) ? (
          <div className="modal-trend">
            <div className="l">Minutes a day · last three weeks</div>
            <div className="bars">
              {trend.map((m, i) => (
                <div
                  key={i}
                  className="b"
                  title={hm(m)}
                  style={{ height: `${m === 0 ? 2 : Math.max(7, (m / max) * 100)}%`, opacity: m === 0 ? 0.22 : 1 }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
