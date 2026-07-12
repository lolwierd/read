import type { LedgerView } from "../lib/view";
import { hm, hourLabel } from "../lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeekStory({ view }: { view: LedgerView }) {
  const w = view.extras.weekComparison;
  const change = w.percentChange;
  const comparison = change === null
    ? "The previous week was quiet, so this one begins the comparison."
    : change === 0
      ? "That is level with the week before."
      : `${Math.abs(change)}% ${change > 0 ? "more" : "less"} than the week before.`;
  const peak = view.extras.peakHour;
  const day = view.extras.busiestDow;
  if (w.currentMinutes === 0) {
    return <div className="week-story" aria-label="This week in words"><span className="story-mark">¶</span><p>No reading has landed in this week yet. The ledger keeps the empty days visible.</p></div>;
  }
  return (
    <div className="week-story" aria-label="This week in words">
      <span className="story-mark">¶</span>
      <p>
        <strong>{hm(w.currentMinutes)}</strong> across {w.activeDays} {w.activeDays === 1 ? "day" : "days"}. {comparison}
        {day !== null ? ` ${DAYS[day]} carries the most reading overall.` : ""}
        {peak !== null ? ` The pages gather around ${hourLabel(peak)}.` : ""}
      </p>
    </div>
  );
}
