import type { LedgerView } from "../lib/view";
import { hm, hourLabel, shortDate } from "../lib/format";
import { Eyebrow } from "./bits";

const SIZE = 280;
const C = SIZE / 2;
const R0 = 58; // inner radius
const RMAX = 130; // outer reach

function polar(r: number, hour: number): [number, number] {
  // hour 0 at top (12 o'clock), advancing clockwise.
  const a = (hour / 24) * 2 * Math.PI - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

export function ReadingClock({ view }: { view: LedgerView }) {
  const tod = view.extras.timeOfDay;
  const max = Math.max(1, ...tod);
  const total = tod.reduce((a, b) => a + b, 0);
  const peak = view.extras.peakHour;
  const afterDark = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5].reduce((s, h) => s + tod[h]!, 0);
  const darkShare = total > 0 ? Math.round((afterDark / total) * 100) : 0;
  const small = total > 0 ? Math.round((100 * [0, 1, 2, 3, 4].reduce((s, h) => s + tod[h]!, 0)) / total) : 0;
  const spread = tod.filter((m) => m > 0).length;
  const busiest = view.extras.calendar.reduce<{ date: string; minutes: number } | null>(
    (b, d) => (d.minutes > (b?.minutes ?? -1) ? d : b),
    null,
  );
  const quietIdx = tod.reduce((q, m, i) => (m < tod[q]! ? i : q), 0);

  const facts: Array<{ l: string; v: string; sub?: string }> = [
    { l: "After dark", v: `${darkShare}%`, sub: "6pm – 6am" },
    { l: "Peak window", v: peak !== null ? hourLabel(peak) : "—", sub: "busiest hour" },
    { l: "Small hours", v: `${small}%`, sub: "midnight – 4am" },
  ];
  if (busiest && busiest.minutes > 0) facts.push({ l: "Biggest day", v: hm(busiest.minutes), sub: shortDate(busiest.date) });
  facts.push({ l: "Hours touched", v: `${spread}`, sub: "of 24" });
  if (total > 0)
    facts.push(
      tod[quietIdx] === 0
        ? { l: "Never at", v: hourLabel(quietIdx), sub: "not once" }
        : { l: "Quietest", v: hourLabel(quietIdx), sub: "least read" },
    );

  return (
    <>
      <Eyebrow num="06" title="The Hours" meta="When the reading happens" />
      <div className="clock">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Reading by hour of day">
          {/* faint frame */}
          <circle cx={C} cy={C} r={RMAX} fill="none" stroke="var(--line)" />
          <circle cx={C} cy={C} r={R0} fill="none" stroke="var(--line)" />
          {/* quarter ticks */}
          {[0, 6, 12, 18].map((h) => {
            const [x1, y1] = polar(R0 - 4, h);
            const [x2, y2] = polar(RMAX + 4, h);
            return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line)" />;
          })}
          {/* hour bars */}
          {tod.map((m, h) => {
            const len = (m / max) * (RMAX - R0);
            const [x1, y1] = polar(R0, h);
            const [x2, y2] = polar(R0 + Math.max(m > 0 ? 3 : 0, len), h);
            const isPeak = peak === h;
            return (
              <line
                key={h}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isPeak ? "var(--ember)" : "var(--teal)"}
                strokeWidth={9}
                strokeLinecap="round"
                opacity={m > 0 ? 0.92 : 0.18}
              />
            );
          })}
          {/* clock labels */}
          {[
            [0, "12a"],
            [6, "6a"],
            [12, "12p"],
            [18, "6p"],
          ].map(([h, lab]) => {
            const [x, y] = polar(RMAX + 18, h as number);
            return (
              <text
                key={lab}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="var(--font-mono)"
                fontSize="10"
                letterSpacing="0.1em"
                fill="var(--ink-3)"
              >
                {lab as string}
              </text>
            );
          })}
          {/* centre */}
          <text
            x={C}
            y={C - 6}
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontSize="30"
            fill="var(--ink)"
          >
            {peak !== null ? hourLabel(peak).split(" ")[0] : "—"}
          </text>
          <text
            x={C}
            y={C + 14}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10"
            letterSpacing="0.12em"
            fill="var(--ink-3)"
          >
            {peak !== null ? `${hourLabel(peak).split(" ")[1]} PEAK` : "NO DATA"}
          </text>
        </svg>

        <div className="note">
          <div className="big">
            {peak !== null ? (
              <>
                You read most around <em>{hourLabel(peak)}</em>.
              </>
            ) : (
              <>The hours are still being written.</>
            )}
          </div>
          <p>
            Each spoke is an hour of the day; its length is the time you’ve spent reading then. The clock fills
            from the inside out — quiet mornings, a long evening, the small hours after dark.
          </p>
          <div className="clock-facts">
            {facts.map((f) => (
              <div className="fact" key={f.l}>
                <div className="l">{f.l}</div>
                <div className="v">{f.v}</div>
                {f.sub ? <div className="sub">{f.sub}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
