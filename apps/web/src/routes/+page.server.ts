import { READING_TZ } from "@read/core";
import { loadRecord } from "$lib/server/record";
import type { PageServerLoad } from "./$types";

export const prerender = false;

function dateLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: READING_TZ,
  }).format(now);
}

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
  setHeaders({ "cache-control": "public, max-age=0, must-revalidate, s-maxage=30, stale-while-revalidate=120" });
  const now = new Date();
  const db = platform?.env?.DB;
  const view = db ? await loadRecord(db, now) : null;
  return {
    view,
    dateLabel: dateLabel(now),
    issue: view ? view.stats.booksThisYear || view.shelf.length : 0,
  };
};
