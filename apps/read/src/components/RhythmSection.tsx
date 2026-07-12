import type { LedgerView } from "../lib/view";
import { hm } from "../lib/format";
import { Eyebrow } from "./bits";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const INI = ["S", "M", "T", "W", "T", "F", "S"];

export function RhythmSection({ view }: { view: LedgerView }) {
  const { weekday, busiestDow, longestStreak, sittings } = view.extras;
  const streak = view.stats.streakDays;
  const max = Math.max(1, ...weekday);
  const total = weekday.reduce((a, b) => a + b, 0);

  const weekendShare = total > 0 ? Math.round((100 * (weekday[0]! + weekday[6]!)) / total) : 0;
  const quietIdx = weekday.reduce((q, m, i) => (m < weekday[q]! ? i : q), 0);
  const sessionsPerDay = view.extras.calendar.filter((d) => d.minutes > 0).length;
  const perReadingDay = sessionsPerDay > 0 ? Math.round(sittings.count / sessionsPerDay) : 0;

  const facts: Array<{ l: string; v: string; sub?: string }> = [
    { l: "Current streak", v: `${streak}`, sub: streak === 1 ? "day" : "days" },
    { l: "Longest streak", v: `${longestStreak}`, sub: "days" },
    { l: "Typical sitting", v: hm(sittings.avg), sub: `longest ${hm(sittings.longest)}` },
    { l: "On weekends", v: `${weekendShare}%`, sub: "Sat + Sun" },
    { l: "Quietest day", v: DOW[quietIdx] ?? "—", sub: weekday[quietIdx] ? "least read" : "never read" },
    { l: "Sittings", v: `${sittings.count}`, sub: perReadingDay ? `~${perReadingDay} a day` : "in all" },
  ];

  return (
    <>
      <Eyebrow num="07" title="The Rhythm" meta="how the reading falls" />
      <div className="rhythm">
        <div className="dowbars" role="img" aria-label={weekday.map((minutes, index) => `${DOW[index]} ${hm(minutes)}`).join(", ")}>
          {weekday.map((m, i) => {
            const zero = m === 0;
            return (
              <div className="dcol" key={i}>
                <div className="dtrack">
                  <div
                    className={`dbar${zero ? " zero" : ""}${i === busiestDow ? " peak" : ""}`}
                    style={{ height: zero ? "3px" : `${Math.max(5, (m / max) * 100)}%` }}
                    title={`${DOW[i]} · ${hm(m)}`}
                    aria-hidden="true"
                  />
                </div>
                <span className={`dlbl${i === busiestDow ? " peak" : ""}`}>{INI[i]}</span>
              </div>
            );
          })}
        </div>

        <div className="rhythm-note">
          <div className="big">
            {busiestDow !== null ? (
              <>
                You read most on <em>{DOW[busiestDow]}s</em>.
              </>
            ) : (
              <>The week has no shape yet.</>
            )}
          </div>
          <p>
            The bars are the days of the week — taller where the hours pile up. Streaks count the days you keep
            the chain unbroken; a sitting is a single unbroken stretch with the book.
          </p>
          <div className="rhythm-facts">
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
