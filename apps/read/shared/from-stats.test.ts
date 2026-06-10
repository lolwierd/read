import { describe, expect, it } from "bun:test";

import { shouldShowStatsBook, type StatsBookRow } from "./from-stats";

function book(overrides: Partial<StatsBookRow> = {}): StatsBookRow {
  return {
    id: 1,
    title: "Test Book",
    authors: "Somebody",
    series: null,
    language: "en",
    pages: 200,
    md5: "abc123",
    last_open: null,
    total_read_time: 0,
    total_read_pages: 0,
    ...overrides,
  };
}

describe("shouldShowStatsBook", () => {
  it("uses percentage progress instead of a fixed page count", () => {
    expect(shouldShowStatsBook(book({ pages: 1000, total_read_pages: 49 }), 0)).toBe(false);
    expect(shouldShowStatsBook(book({ pages: 1000, total_read_pages: 50 }), 0)).toBe(true);
    expect(shouldShowStatsBook(book({ pages: 100, total_read_pages: 5 }), 0)).toBe(true);
  });

  it("keeps the time and session fallbacks", () => {
    expect(shouldShowStatsBook(book({ total_read_time: 299 }), 0)).toBe(false);
    expect(shouldShowStatsBook(book({ total_read_time: 300 }), 0)).toBe(true);
    expect(shouldShowStatsBook(book(), 20)).toBe(true);
  });

  it("falls back to fixed pages only when page count is missing", () => {
    expect(shouldShowStatsBook(book({ pages: null, total_read_pages: 19 }), 0)).toBe(false);
    expect(shouldShowStatsBook(book({ pages: null, total_read_pages: 20 }), 0)).toBe(true);
  });

  it("still drops known junk titles", () => {
    expect(shouldShowStatsBook(book({ title: "KOReader Quickstart Guide", total_read_time: 600 }), 0)).toBe(false);
    expect(shouldShowStatsBook(book({ title: "MyScript-Regular", total_read_time: 600 }), 0)).toBe(false);
    expect(shouldShowStatsBook(book({ title: "Chapter 12", total_read_time: 600 }), 0)).toBe(false);
  });
});
