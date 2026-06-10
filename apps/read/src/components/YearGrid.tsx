import { useEffect, useState } from "react";
import type { LedgerView } from "../lib/view";
import { hm, monthOf, shortDate } from "../lib/format";
import { Eyebrow } from "./bits";

const LEVELS = [
  "var(--paper-sink)",
  "rgba(21,105,91,0.26)",
  "rgba(21,105,91,0.46)",
  "rgba(21,105,91,0.68)",
  "rgba(21,105,91,0.92)",
];

function level(minutes: number, max: number): number {
  if (minutes <= 0) return 0;
  if (max <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil((minutes / max) * 4)));
}

const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

interface Tip {
  text: string;
  x: number;
  y: number;
}

export function YearGrid({ view }: { view: LedgerView }) {
  const { calendar, calendarMax } = view.extras;
  const daysRead = calendar.filter((d) => d.minutes > 0).length;
  const [tip, setTip] = useState<Tip | null>(null);

  // Narrow screens can't fit a full year — show the trailing months instead (ending today,
  // so the current month is always the last column).
  const [weeks, setWeeks] = useState(53);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 560px)");
    const apply = () => setWeeks(mq.matches ? 18 : 53);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const shown = calendar.slice(-weeks * 7);

  const lead = shown.length ? weekday(shown[0]!.date) : 0;
  const cells: ({ date: string; minutes: number } | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...shown,
  ];
  const columns = Math.ceil(cells.length / 7);

  const monthMarks: { col: number; label: string }[] = [];
  let prev = "";
  for (let col = 0; col < columns; col++) {
    const top = cells[col * 7];
    if (!top) continue;
    const m = monthOf(top.date);
    if (m !== prev) {
      monthMarks.push({ col, label: m });
      prev = m;
    }
  }

  const show = (e: React.MouseEvent, c: { date: string; minutes: number }) => {
    const host = (e.currentTarget.closest(".year") as HTMLElement).getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left - host.left + r.width / 2;
    setTip({
      text: `${shortDate(c.date)} · ${c.minutes ? hm(c.minutes) : "nothing read"}`,
      // keep the centered tooltip clear of the container edges
      x: Math.max(58, Math.min(host.width - 58, x)),
      y: r.top - host.top,
    });
  };

  return (
    <>
      <Eyebrow num="05" title="The Year in Pages" meta={`${daysRead} days read`} />
      <div className="year" onMouseLeave={() => setTip(null)}>
        {tip ? (
          <div className="yeartip" style={{ left: tip.x, top: tip.y }}>
            {tip.text}
          </div>
        ) : null}
        <div className="year-scroll">
          <div className="months" style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 13px)`, gap: 3 }}>
            {Array.from({ length: columns }, (_, col) => {
              const mark = monthMarks.find((mm) => mm.col === col);
              return (
                <span key={col} style={{ gridColumn: col + 1, whiteSpace: "nowrap" }}>
                  {mark ? mark.label : ""}
                </span>
              );
            })}
          </div>
          <div className="grid">
            {cells.map((c, i) =>
              c ? (
                <div
                  className="cell live"
                  key={i}
                  style={{ background: LEVELS[level(c.minutes, calendarMax)] }}
                  onMouseEnter={(e) => show(e, c)}
                />
              ) : (
                <div className="cell" key={i} style={{ background: "transparent", outline: "none" }} />
              ),
            )}
          </div>
          <div className="legend">
            <span>Less</span>
            {LEVELS.map((bg, i) => (
              <span className="cell" key={i} style={{ background: bg }} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </>
  );
}
