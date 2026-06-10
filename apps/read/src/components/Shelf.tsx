import type { LedgerView } from "../lib/view";
import { oneDp } from "../lib/format";
import { statusTone } from "../lib/view";
import { Cover } from "./Cover";
import { Eyebrow } from "./bits";

export function Shelf({ view, onSelect }: { view: LedgerView; onSelect: (md5: string) => void }) {
  const books = view.shelf;
  return (
    <>
      <Eyebrow num="08" title="The Shelf" meta={`${books.length} volumes`} />
      {books.length === 0 ? (
        <p className="empty">An empty shelf. The first book you open on the Kobo lands here.</p>
      ) : (
        <div className="shelf">
        {books.map((b) => (
          <button className="shelfitem" key={b.md5} onClick={() => onSelect(b.md5)} aria-label={`${b.title} stats`}>
            <div className="coverhold">
              <Cover book={b} />
            </div>
            <div className="belt">
              <div className="pmeter">
                <span style={{ width: `${Math.max(2, b.percent)}%` }} />
              </div>
              <div className="line">
                <span>
                  <span className="dot" style={{ background: statusTone(b.status) }} />
                  {b.percent}%
                </span>
                <span>{b.hoursInBook >= 0.05 ? `${oneDp(b.hoursInBook)}h` : "—"}</span>
              </div>
              <div className="ttl">{b.title}</div>
            </div>
          </button>
          ))}
        </div>
      )}
    </>
  );
}
