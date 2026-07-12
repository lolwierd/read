import type { LedgerView, BookView } from "../lib/view";
import { oneDp } from "../lib/format";
import { Cover } from "./Cover";
import { Eyebrow, Sparkline } from "./bits";

export function NowReading({ view, onSelect }: { view: LedgerView; onSelect: (md5: string) => void }) {
  // Everything in hand = reading (0 < % < ~99), most-recently-opened first. Never just one.
  const reading: BookView[] = view.shelf
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.lastOpen ?? 0) - (a.lastOpen ?? 0));
  const primary = view.now ?? reading[0] ?? null;
  const others = reading
    .filter((b) => b.md5 !== primary?.md5)
    .slice(0, 4);
  const onGo = (primary ? 1 : 0) + others.length;

  return (
    <>
      <Eyebrow num="01" title="In Hand" meta={onGo ? `${onGo} on the go` : "—"} />
      {primary ? (
        <div className="now">
          <button className="coverhold cover-btn" onClick={() => onSelect(primary.md5)} aria-label={`${primary.title} stats`}>
            <Cover book={primary} big />
          </button>
          <div className="right">
            <h2>{primary.title}</h2>
            <div className="byline">{primary.author ?? "Unknown hand"}</div>

            <div className="meterwrap">
              <div className="meter">
                <span style={{ width: `${Math.max(2, primary.percent)}%` }} />
              </div>
              <div className="meterrow">
                <span className="pct">{primary.percent}%</span>
                <span>{primary.pages ? `${Math.round((primary.percent / 100) * primary.pages)} / ${primary.pages} pp` : "progress"}</span>
              </div>
            </div>

            <div className="facts">
              <div className="fact">
                <div className="l">Hours in book</div>
                <div className="v">
                  {oneDp(primary.hoursInBook)}
                  <small> h</small>
                </div>
              </div>
              {view.extras.nowTrend.some((x) => x > 0) ? (
                <div className="fact" style={{ flex: "1 1 200px" }}>
                  <div className="l">Last week</div>
                  <Sparkline data={view.extras.nowTrend.slice(-7)} />
                </div>
              ) : null}
            </div>

            {others.length ? (
              <div className="alsoreading">
                <div className="l">Also on the go</div>
                <div className="strip">
                  {others.map((b) => (
                    <button key={b.md5} className="mini" onClick={() => onSelect(b.md5)} aria-label={`${b.title} stats`}>
                      <div className="minicover">
                        <Cover book={b} />
                        <div className="miniprog">
                          <span style={{ width: `${Math.max(4, b.percent)}%` }} />
                        </div>
                      </div>
                      <div className="minipct">
                        {b.percent}% · {oneDp(b.hoursInBook)}h
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty">Nothing in hand just now — the shelf awaits below.</p>
      )}
    </>
  );
}
