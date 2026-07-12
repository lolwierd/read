import { describe, expect, it } from "bun:test";
import { parseKoDatetime, type Book, type Session } from "@read/core";
import { buildLedgerView } from "./stats";

const book: Book = {
  md5: "book", title: "Book", authors: "Author", series: null, language: "en", isbn: null,
  pages: 100, percent_finished: 0.5, status: "reading", rating: null, review: null,
  last_open: parseKoDatetime("2026-06-02 12:00:00"), total_read_time: 3600,
  total_read_pages: 50, current_chapter: null, cover_url: null,
};

const session = (time: string, duration: number, page: number): Session => ({
  book_md5: "book", page, start_time: parseKoDatetime(time), duration, total_pages: 100,
});

describe("ledger interval rollups", () => {
  it("splits reading across midnight and hour buckets", () => {
    const view = buildLedgerView(
      [book],
      [session("2026-06-01 23:50:00", 20 * 60, 10)],
      [],
      new Date(parseKoDatetime("2026-06-02 12:00:00") * 1000),
    );
    expect(view.extras.calendar.find((day) => day.date === "2026-06-01")?.minutes).toBe(10);
    expect(view.extras.calendar.find((day) => day.date === "2026-06-02")?.minutes).toBe(10);
    expect(view.extras.timeOfDay[23]).toBe(10);
    expect(view.extras.timeOfDay[0]).toBe(10);
  });

  it("does not split a sitting because one page took longer than the gap", () => {
    const first = parseKoDatetime("2026-06-02 10:00:00");
    const sessions: Session[] = [
      { book_md5: "book", page: 1, start_time: first, duration: 30 * 60, total_pages: 100 },
      { book_md5: "book", page: 2, start_time: first + 30 * 60, duration: 5 * 60, total_pages: 100 },
    ];
    const view = buildLedgerView([book], sessions, [], new Date(parseKoDatetime("2026-06-02 12:00:00") * 1000));
    expect(view.extras.sittings.count).toBe(1);
    expect(view.extras.sittings.longest).toBe(35);
  });
});
