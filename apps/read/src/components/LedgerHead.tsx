import type { LedgerView } from "../lib/view";

export function LedgerHead({ view }: { view: LedgerView }) {
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
      </div>
    </header>
  );
}
