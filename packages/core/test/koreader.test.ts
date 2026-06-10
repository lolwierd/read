import { describe, expect, it } from "vitest";
import {
  deriveStatus,
  isMeaningfulAnnotation,
  normalizeAuthors,
  normalizeIsbn,
  toAnnotation,
  toBook,
  toSession,
} from "../src/koreader.js";
import { ingestPayload } from "../src/schemas.js";
import { annotation } from "./fixtures.js";

describe("deriveStatus", () => {
  it("honours explicit KOReader summary statuses", () => {
    expect(deriveStatus("complete", 0.4)).toBe("finished");
    expect(deriveStatus("finished", 0)).toBe("finished");
    expect(deriveStatus("abandoned", 0.5)).toBe("abandoned");
    expect(deriveStatus("on_hold", 0.5)).toBe("paused");
    expect(deriveStatus("paused", 0.5)).toBe("paused");
    expect(deriveStatus("tbr", 0.5)).toBe("unread");
  });
  it("infers from progress when status is reading/null", () => {
    expect(deriveStatus("reading", 0.5)).toBe("reading");
    expect(deriveStatus(null, 0.99)).toBe("finished");
    expect(deriveStatus(null, 1)).toBe("finished");
    expect(deriveStatus(null, 0.01)).toBe("reading");
    expect(deriveStatus(null, 0)).toBe("unread");
  });
});

describe("normalizeAuthors", () => {
  it("passes null through", () => {
    expect(normalizeAuthors(null)).toBeNull();
  });
  it("joins newline-separated authors and tidies commas/space", () => {
    expect(normalizeAuthors("Patrick Rothfuss")).toBe("Patrick Rothfuss");
    expect(normalizeAuthors("Rothfuss\nSanderson")).toBe("Rothfuss, Sanderson");
    expect(normalizeAuthors("A\\nB")).toBe("A, B");
    expect(normalizeAuthors("  ,  Le Guin ,  ")).toBe("Le Guin");
  });
  it("returns null for an all-whitespace string", () => {
    expect(normalizeAuthors("   ")).toBeNull();
  });
});

describe("normalizeIsbn", () => {
  it("passes null through", () => {
    expect(normalizeIsbn(null)).toBeNull();
  });
  it("keeps clean 13- and 10-digit ISBNs", () => {
    expect(normalizeIsbn("9780756404741")).toBe("9780756404741");
    expect(normalizeIsbn("0441007317")).toBe("0441007317");
    expect(normalizeIsbn("044100731X")).toBe("044100731X");
  });
  it("strips hyphens and prefixes", () => {
    expect(normalizeIsbn("978-0-7564-0474-1")).toBe("9780756404741");
    expect(normalizeIsbn("isbn:9780756404741")).toBe("9780756404741");
  });
  it("extracts the labelled ISBN from a multi-identifier KOReader blob", () => {
    // Real shape from a device sidecar: uuid + calibre + ISBN, newline-joined.
    expect(normalizeIsbn("uuid:e9b370c0-49f5-487f-97ae-6ed99a238173\ncalibre:dee35094\nISBN:9780486406534")).toBe(
      "9780486406534",
    );
    expect(normalizeIsbn("ISBN:978-0-486-40653-4")).toBe("9780486406534");
  });
  it("does NOT fabricate an ISBN from a uuid-only identifier", () => {
    expect(normalizeIsbn("uuid:e9b370c0-49f5-487f-97ae-6ed99a238173")).toBeNull();
    expect(normalizeIsbn("calibre:dee35094-edb2-4580-a996-1036ea8b9545")).toBeNull();
  });
  it("returns null for junk", () => {
    expect(normalizeIsbn("calibre:1234")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
  });
});

describe("toBook / toSession / toAnnotation (via validated input)", () => {
  it("normalizes a full payload book", () => {
    const parsed = ingestPayload.parse({
      books: [
        {
          md5: "ABC123",
          title: "  Dune  ",
          authors: "Herbert\nAnderson",
          isbn: "978-0-441-17271-9",
          percent_finished: 1,
          status: "reading",
          current_chapter: " Ch. 1 ",
          series: " Dune ",
        },
      ],
    });
    const b = toBook(parsed.books[0]!);
    expect(b.title).toBe("Dune");
    expect(b.authors).toBe("Herbert, Anderson");
    expect(b.isbn).toBe("9780441172719");
    expect(b.status).toBe("finished"); // 100% overrides "reading"
    expect(b.current_chapter).toBe("Ch. 1");
    expect(b.series).toBe("Dune");
    expect(b.cover_url).toBeNull();
  });

  it("blanks empty optional strings to null", () => {
    const parsed = ingestPayload.parse({
      books: [{ md5: "abcdef", title: "X", series: "  ", review: "", current_chapter: "" }],
    });
    const b = toBook(parsed.books[0]!);
    expect(b.series).toBeNull();
    expect(b.review).toBeNull();
    expect(b.current_chapter).toBeNull();
    expect(b.status).toBe("unread"); // percent defaults to 0
  });

  it("maps a session", () => {
    const parsed = ingestPayload.parse({
      sessions: [{ md5: "abcdef", page: 12, start_time: 1000, duration: 90 }],
    });
    const s = toSession(parsed.sessions[0]!);
    expect(s).toEqual({ book_md5: "abcdef", page: 12, start_time: 1000, duration: 90, total_pages: 0 });
  });

  it("maps an annotation and parses its datetime", () => {
    const parsed = ingestPayload.parse({
      annotations: [
        { md5: "abcdef", datetime: "2026-05-26 22:45:35", text: "  hi  ", note: "  ", chapter: " Ch " },
      ],
    });
    const a = toAnnotation(parsed.annotations[0]!);
    expect(a.text).toBe("hi");
    expect(a.note).toBeNull();
    expect(a.chapter).toBe("Ch");
    expect(a.datetime_epoch).toBeGreaterThan(0);
    expect(a.pos0).toBe(""); // null pos0 coerced to "" so the dedupe key works
  });
});

describe("isMeaningfulAnnotation", () => {
  it("is true when there's highlighted text or a note", () => {
    expect(isMeaningfulAnnotation(annotation({ text: "x", note: null }))).toBe(true);
    expect(isMeaningfulAnnotation(annotation({ text: null, note: "x" }))).toBe(true);
  });
  it("is false for a bare bookmark", () => {
    expect(isMeaningfulAnnotation(annotation({ text: null, note: null }))).toBe(false);
    expect(isMeaningfulAnnotation(annotation({ text: "", note: "" }))).toBe(false);
  });
});
