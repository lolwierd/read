import type { LedgerView } from "../../shared/stats";
import type { BookView } from "@read/core";

export type { LedgerView };
export type { BookView, HighlightView, WeekDay } from "@read/core";

/** Dev fetches the fixture JSON from the bun builder; prod fetches the static record.json
 *  written by scripts/build-record.ts on miso and served by Caddy alongside the app. */
export async function fetchLedger(): Promise<LedgerView> {
  const url = import.meta.env.DEV ? "/record.dev.json" : "/record.json";
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-cache" });
  if (!res.ok) throw new Error(`ledger ${res.status}`);
  return res.json();
}

// ── Cloth spine fallback ──────────────────────────────────────────────────────
// When a book has no cover art we dress it in a deterministic clothbound spine. The
// colour is stable per book (same title always wears the same cloth).
export interface Cloth {
  cloth: string;
  ink: string;
  band: string;
}
const CLOTHS: Cloth[] = [
  { cloth: "#15695b", ink: "#f0ece2", band: "#0f4d43" }, // teal
  { cloth: "#7c2f2a", ink: "#f1e6dd", band: "#5e211d" }, // oxblood
  { cloth: "#2c3a4a", ink: "#e7ecf1", band: "#1f2a36" }, // slate
  { cloth: "#4a5a36", ink: "#eef0e2", band: "#374327" }, // moss
  { cloth: "#8a5a1e", ink: "#f5ebda", band: "#6c4514" }, // ochre
  { cloth: "#473a52", ink: "#ece5f0", band: "#332940" }, // plum
  { cloth: "#1f1d1a", ink: "#e6e1d6", band: "#000000" }, // ink
];

export function clothFor(key: string): Cloth {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CLOTHS[h % CLOTHS.length]!;
}

export function statusTone(status: BookView["status"]): string {
  switch (status) {
    case "reading":
      return "var(--teal-bright)";
    case "finished":
      return "var(--ink)";
    case "paused":
      return "var(--ember)";
    case "abandoned":
      return "var(--ink-3)";
    default:
      return "var(--line-strong)";
  }
}
