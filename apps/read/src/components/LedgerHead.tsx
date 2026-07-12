import { useEffect, useState } from "react";
import type { LedgerView } from "../lib/view";

const relative = (generatedAt: number, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - generatedAt * 1000) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export function LedgerHead({ view }: { view: LedgerView }) {
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const ageHours = (now - view.generatedAt * 1000) / 3_600_000;
  const state = !online ? "offline" : ageHours > 24 ? "stale" : "fresh";
  return (
    <header className="ledger-head">
      <div className="ledger-mark">
        <span className="ledger-name">read</span>
      </div>
      <div className="ledger-head-right">
        <nav aria-label="Ledger sections">
          <a href="#today">today</a>
          <a href="#week">week</a>
          <a href="#year">year</a>
          <a href="#hours">hours</a>
          <a href="#shelf">shelf</a>
        </nav>
        <span className={`freshness ${state}`}><i />received {relative(view.generatedAt, now)}</span>
      </div>
    </header>
  );
}
