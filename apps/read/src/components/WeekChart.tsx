import type { LedgerView } from "../lib/view";
import { hm } from "../lib/format";
import { Eyebrow } from "./bits";

export function WeekChart({ view }: { view: LedgerView }) {
  const { week, weekMinutes } = view.stats;
  const max = Math.max(1, ...week.map((d) => d.minutes));
  return (
    <>
      <Eyebrow num="04" title="The Week" meta={`${hm(weekMinutes)} · last 7 days`} />
      <div className="week">
        {week.map((d) => {
          const zero = d.minutes === 0;
          const pct = (d.minutes / max) * 100;
          return (
            <div className="col" key={d.day}>
              <div className="track">
                <div
                  className={`bar${zero ? " zero" : ""}${d.today ? " today" : ""}`}
                  style={{ height: zero ? "3px" : `${Math.max(4, pct)}%` }}
                />
              </div>
              <span className="val">{zero ? "·" : hm(d.minutes)}</span>
              <span className={`lbl${d.today ? " today" : ""}`}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
