import { useState } from "react";
import type { BookView } from "../lib/view";
import { clothFor } from "../lib/view";

/** A clothbound spine, drawn when there's no cover art (or it fails to load). Deterministic
 *  cloth colour per book; two hairline rules echo a real cloth binding. */
function Spine({ book }: { book: BookView }) {
  const c = clothFor(book.md5 || book.title);
  return (
    <div className="spine" style={{ background: c.cloth, color: c.ink }}>
      <div className="rule" />
      <div className="t">{book.title}</div>
      <div>
        <div className="rule" style={{ marginBottom: 8 }} />
        <div className="a">{book.author ?? "Unknown"}</div>
      </div>
    </div>
  );
}

export function Cover({ book, big = false }: { book: BookView; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const showArt = book.coverUrl && !failed;
  return (
    <div className={`cover${big ? " big" : ""}`}>
      {showArt ? (
        <img
          src={book.coverUrl ?? undefined}
          alt={`${book.title} — cover`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Spine book={book} />
      )}
    </div>
  );
}
