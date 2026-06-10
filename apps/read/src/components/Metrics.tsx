import type { LedgerView } from "../lib/view";
import { group, hm, oneDp, shortDate } from "../lib/format";
import { Eyebrow } from "./bits";

export function Metrics({ view }: { view: LedgerView }) {
  const e = view.extras;
  const daysRead = e.calendar.filter((d) => d.minutes > 0).length;
  const minPerDay = daysRead ? (e.totalHours * 60) / daysRead : 0;
  const pagesPerHour = e.totalHours > 0 ? Math.round(e.totalPages / e.totalHours) : 0;

  const cells = [
    { v: group(e.totalPages), u: "", l: "Pages turned" },
    { v: group(pagesPerHour), u: "/hr", l: "Reading pace" },
    { v: hm(minPerDay), u: "", l: "A day’s reading" },
    { v: group(daysRead), u: "", l: "Days with a book" },
  ];

  return (
    <>
      <Eyebrow num="03" title="The Tally" meta="Lifetime" />
      <div className="tally">
        <div className="tally-lead">
          <div className="v">
            {oneDp(e.totalHours)}
            <small>h</small>
          </div>
          <div className="l">Hours in the chair</div>
          <div className="gloss">
            {daysRead} days {e.firstDay ? `· since ${shortDate(e.firstDay)}` : ""}
          </div>
        </div>
        <div className="tally-grid">
          {cells.map((c) => (
            <div className="tcell" key={c.l}>
              <div className="tv">
                {c.v}
                {c.u ? <small>{c.u}</small> : null}
              </div>
              <div className="tl">{c.l}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
