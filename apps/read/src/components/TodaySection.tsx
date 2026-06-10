import type { LedgerView } from "../lib/view";
import { group, hm } from "../lib/format";
import { Eyebrow } from "./bits";

export function TodaySection({ view }: { view: LedgerView }) {
  const t = view.extras.today;
  const pace = t.minutes > 0 ? Math.round(t.pages / (t.minutes / 60)) : 0;

  const cells: Array<{ l: string; v: string; u?: string; sub?: string }> = [
    { l: "Time read", v: hm(t.minutes) },
    { l: "Pages", v: group(t.pages) },
    { l: "Pace", v: `${pace}`, u: "/hr" },
    { l: "Sittings", v: `${t.sittings}`, sub: t.longestSitting ? `longest ${hm(t.longestSitting)}` : undefined },
  ];

  return (
    <>
      <Eyebrow num="02" title="Today" meta={t.firstAt && t.lastAt ? `${t.firstAt} – ${t.lastAt}` : "—"} />
      {t.minutes > 0 ? (
        <div className="today-band">
          {cells.map((c) => (
            <div className="tcell2" key={c.l}>
              <div className="tv">
                {c.v}
                {c.u ? <small>{c.u}</small> : null}
              </div>
              <div className="tl">{c.l}</div>
              {c.sub ? <div className="tsub">{c.sub}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Nothing read yet today — the day’s still young.</p>
      )}
    </>
  );
}
