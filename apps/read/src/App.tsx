import { useEffect, useState } from "react";
import { fetchLedger, type LedgerView } from "./lib/view";
import { Reveal } from "./components/Reveal";
import { NowReading } from "./components/NowReading";
import { TodaySection } from "./components/TodaySection";
import { Metrics } from "./components/Metrics";
import { WeekChart } from "./components/WeekChart";
import { YearGrid } from "./components/YearGrid";
import { ReadingClock } from "./components/ReadingClock";
import { RhythmSection } from "./components/RhythmSection";
import { Shelf } from "./components/Shelf";
import { BookModal } from "./components/BookModal";

export default function App() {
  const [view, setView] = useState<LedgerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    // Only swap state when the data actually changed, so polling doesn't cause re-renders.
    const apply = (v: LedgerView) =>
      setView((prev) => (prev && prev.generatedAt === v.generatedAt ? prev : v));

    fetchLedger()
      .then(apply)
      .catch((e: unknown) => setError(String(e)));

    // Pick up a fresh record.json (rebuilt on each KOReader WebDAV sync) without a manual
    // reload: poll periodically and refetch whenever the tab regains focus.
    const poll = () => {
      if (!stopped) fetchLedger().then(apply).catch(() => {});
    };
    const id = window.setInterval(poll, 30_000);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", poll);

    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", poll);
    };
  }, []);

  if (error) return <div className="boot">{error}</div>;
  if (!view) return <div className="boot">Opening the ledger…</div>;

  return (
    <main className="shell">
      <Reveal i={0} className="section">
        <NowReading view={view} onSelect={setSelected} />
      </Reveal>
      <Reveal i={1} className="section">
        <TodaySection view={view} />
      </Reveal>
      <Reveal i={2} className="section">
        <Metrics view={view} />
      </Reveal>
      <Reveal i={3} className="section">
        <WeekChart view={view} />
      </Reveal>
      <Reveal i={4} className="section">
        <YearGrid view={view} />
      </Reveal>
      <Reveal i={5} className="section">
        <ReadingClock view={view} />
      </Reveal>
      <Reveal i={6} className="section">
        <RhythmSection view={view} />
      </Reveal>
      <Reveal i={7} className="section">
        <Shelf view={view} onSelect={setSelected} />
      </Reveal>
      <BookModal view={view} md5={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
