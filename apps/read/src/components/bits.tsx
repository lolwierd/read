/** The mono section header used across the ledger: "§ 04 · THE WEEK …… meta". */
export function Eyebrow({ num, title, meta }: { num: string; title: string; meta?: string }) {
  return (
    <div className="eyebrow">
      <span className="lead">
        <span className="num">§ {num}</span>
        <span className="ttl">{title}</span>
      </span>
      {meta ? <span className="meta">{meta}</span> : null}
    </div>
  );
}

/** A minimal area sparkline for the now-reading fortnight trend. */
export function Sparkline({ data, w = 220, h = 46 }: { data: number[]; w?: number; h?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <path d={area} fill="var(--teal-wash)" />
      <path d={line} fill="none" stroke="var(--teal)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--teal-bright)" />
    </svg>
  );
}
