import { describe, expect, it } from "vitest";
import {
  booksFinishedInYear,
  buildRecordView,
  buildWeek,
  minutesOnDay,
  nowReading,
  pullQuotes,
  recentHighlights,
  shelfOrder,
  statusLabel,
  streakDays,
  toBookView,
} from "../src/rollups.js";
import type { Book } from "../src/types.js";
import { annotation, book, session } from "./fixtures.js";

const REF = new Date("2026-06-01T15:00:00Z"); // 20:30 IST on 2026-06-01

describe("statusLabel", () => {
  it("labels every status", () => {
    expect(statusLabel("reading")).toBe("Reading");
    expect(statusLabel("finished")).toBe("Finished");
    expect(statusLabel("paused")).toBe("Paused");
    expect(statusLabel("abandoned")).toBe("Set aside");
    expect(statusLabel("unread")).toBe("Up next");
  });
});

describe("toBookView", () => {
  it("rounds percent, converts hours, derives fallback + cover", () => {
    const v = toBookView(book({ percent_finished: 0.734, total_read_time: 14820, cover_url: null }));
    expect(v.percent).toBe(73);
    expect(v.hoursInBook).toBe(4.1); // 14820s = 4.117h → 4.1
    expect(v.coverUrl).toContain("9780756404741");
    expect(v.coverFallback).toMatch(/^var\(--/);
    expect(v.statusLabel).toBe("Reading");
  });
  it("prefers a cached cover_url over the ISBN URL", () => {
    expect(toBookView(book({ cover_url: "https://example/x.jpg" })).coverUrl).toBe("https://example/x.jpg");
  });
});

describe("minutesOnDay", () => {
  it("sums only sessions on that IST day", () => {
    const sessions = [
      session("2026-06-01", "10:00:00", 600), // 10 min
      session("2026-06-01", "23:50:00", 1200), // 20 min, still 06-01 IST
      session("2026-05-31", "10:00:00", 600), // other day
    ];
    expect(minutesOnDay(sessions, "2026-06-01")).toBe(30);
  });
});

describe("buildWeek", () => {
  it("returns 7 trailing days with today last", () => {
    const week = buildWeek([session("2026-06-01", "10:00:00", 1800)], "2026-06-01");
    expect(week).toHaveLength(7);
    expect(week[0]!.day).toBe("2026-05-26");
    expect(week[6]!.day).toBe("2026-06-01");
    expect(week[6]!.today).toBe(true);
    expect(week[6]!.minutes).toBe(30);
    expect(week[0]!.minutes).toBe(0);
  });
});

describe("streakDays", () => {
  it("counts consecutive days ending today", () => {
    const sessions = ["2026-05-30", "2026-05-31", "2026-06-01"].map((d) => session(d, "10:00:00", 600));
    expect(streakDays(sessions, "2026-06-01")).toBe(3);
  });
  it("grants grace when today has no reading yet but yesterday does", () => {
    const sessions = ["2026-05-30", "2026-05-31"].map((d) => session(d, "10:00:00", 600));
    expect(streakDays(sessions, "2026-06-01")).toBe(2);
  });
  it("is broken when neither today nor yesterday saw reading", () => {
    const sessions = [session("2026-05-28", "10:00:00", 600)];
    expect(streakDays(sessions, "2026-06-01")).toBe(0);
  });
  it("is 0 with no sessions, and ignores zero-duration sessions", () => {
    expect(streakDays([], "2026-06-01")).toBe(0);
    expect(streakDays([session("2026-06-01", "10:00:00", 0)], "2026-06-01")).toBe(0);
  });
  it("stops at a gap", () => {
    const sessions = ["2026-05-28", "2026-05-31", "2026-06-01"].map((d) => session(d, "10:00:00", 600));
    expect(streakDays(sessions, "2026-06-01")).toBe(2);
  });
});

describe("booksFinishedInYear", () => {
  const books: Book[] = [
    book({ md5: "a", status: "finished", last_open: session("2026-02-01", "10:00:00", 1).start_time }),
    book({ md5: "b", status: "finished", last_open: session("2025-02-01", "10:00:00", 1).start_time }),
    book({ md5: "c", status: "reading" }),
    book({ md5: "d", status: "finished", last_open: null }),
  ];
  it("counts only books finished within the year", () => {
    expect(booksFinishedInYear(books, 2026)).toBe(1);
    expect(booksFinishedInYear(books, 2025)).toBe(1);
    expect(booksFinishedInYear(books, 2024)).toBe(0);
  });
});

describe("recentHighlights / pullQuotes", () => {
  const booksByMd5 = new Map([["abc123", book()]]);
  it("returns meaningful highlights newest first, limited", () => {
    const ann = [
      annotation({ datetime: "2026-05-20 10:00:00", text: "old" }),
      annotation({ datetime: "2026-05-26 10:00:00", text: "new" }),
      annotation({ datetime: "2026-05-25 10:00:00", text: null, note: null }), // bookmark, dropped
    ];
    const hs = recentHighlights(ann, booksByMd5, 5);
    expect(hs.map((h) => h.text)).toEqual(["new", "old"]);
    expect(hs[0]!.bookTitle).toBe("The Name of the Wind");
  });
  it("falls back to note text and Unknown title", () => {
    const hs = recentHighlights([annotation({ text: null, note: "my note", book_md5: "zzz" })], new Map());
    expect(hs[0]!.text).toBe("my note");
    expect(hs[0]!.bookTitle).toBe("Unknown");
  });
  it("pullQuotes keeps only pleasantly-sized lines", () => {
    const ann = [
      annotation({ datetime: "2026-05-26 10:00:00", text: "x" }), // too short
      annotation({ datetime: "2026-05-25 10:00:00", text: "y".repeat(300) }), // too long
      annotation({ datetime: "2026-05-24 10:00:00", text: "A line of a very reasonable length." }),
    ];
    const q = pullQuotes(ann, booksByMd5);
    expect(q).toHaveLength(1);
    expect(q[0]!.text).toBe("A line of a very reasonable length.");
  });
});

describe("shelfOrder / nowReading", () => {
  const books: Book[] = [
    book({ md5: "fin", status: "finished", last_open: 5000 }),
    book({ md5: "read-old", status: "reading", last_open: 1000 }),
    book({ md5: "read-new", status: "reading", last_open: 9000 }),
  ];
  it("puts reading books first, then by recency", () => {
    expect(shelfOrder(books).map((b) => b.md5)).toEqual(["read-new", "read-old", "fin"]);
  });
  it("nowReading picks the most recent reading book", () => {
    expect(nowReading(books)?.md5).toBe("read-new");
    expect(nowReading([book({ status: "finished" })])).toBeNull();
  });
});

describe("buildRecordView", () => {
  it("assembles the full front page", () => {
    const books = [
      book({ md5: "abc123", status: "reading", last_open: REF.getTime() / 1000 }),
      book({ md5: "done", status: "finished", last_open: session("2026-01-10", "10:00:00", 1).start_time }),
    ];
    const sessions = [
      session("2026-06-01", "10:00:00", 1800, { book_md5: "abc123" }),
      session("2026-05-31", "10:00:00", 1200, { book_md5: "abc123" }),
    ];
    const ann = [annotation({ datetime: "2026-05-26 22:45:35" })];
    const view = buildRecordView(books, sessions, ann, REF);

    expect(view.now?.md5).toBe("abc123");
    expect(view.stats.minutesToday).toBe(30);
    expect(view.stats.streakDays).toBe(2);
    expect(view.stats.week).toHaveLength(7);
    expect(view.stats.weekMinutes).toBe(50);
    expect(view.stats.bestDay?.minutes).toBe(30);
    expect(view.stats.booksThisYear).toBe(1);
    expect(view.stats.linesKept).toBe(1);
    expect(view.shelf).toHaveLength(2);
    expect(view.margins).toHaveLength(1);
  });

  it("handles an empty library without throwing", () => {
    const view = buildRecordView([], [], [], REF);
    expect(view.now).toBeNull();
    expect(view.stats.bestDay).toBeNull();
    expect(view.stats.streakDays).toBe(0);
    expect(view.shelf).toEqual([]);
  });
});
