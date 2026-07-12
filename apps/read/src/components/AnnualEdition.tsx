import type { LedgerView } from "../lib/view";
import { group, hm, shortDate } from "../lib/format";
import { Eyebrow } from "./bits";

export function AnnualEdition({ view }: { view: LedgerView }) {
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(view.generatedAt * 1000));
  const yearDays = view.extras.calendar.filter((d) => d.date.startsWith(year) && d.minutes > 0);
  const minutes = yearDays.reduce((sum, day) => sum + day.minutes, 0);
  const biggest = yearDays.reduce<(typeof yearDays)[number] | null>((best, day) => !best || day.minutes > best.minutes ? day : best, null);
  const tags = new Map<string, number>();
  for (const book of view.shelf) for (const tag of book.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  const topTag = [...tags].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return (
    <>
      <Eyebrow num="09" title={`${year} Edition`} meta="a year still being written" />
      <div className="annual">
        <div className="annual-year">{year}</div>
        <div className="annual-copy">
          <p><em>{view.stats.booksThisYear}</em> books finished across <em>{yearDays.length}</em> reading days.</p>
          <div className="annual-facts">
            <span><b>{hm(minutes)}</b> recorded</span>
            <span><b>{group(view.extras.totalPages)}</b> pages turned</span>
            {biggest ? <span><b>{hm(biggest.minutes)}</b> on {shortDate(biggest.date)}</span> : null}
            {topTag ? <span><b>{topTag}</b> appears most</span> : null}
          </div>
        </div>
      </div>
    </>
  );
}
