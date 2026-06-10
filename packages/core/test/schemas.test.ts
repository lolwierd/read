import { describe, expect, it } from "vitest";
import { annotationInput, bookInput, ingestPayload, sessionInput } from "../src/schemas.js";

describe("ingestPayload", () => {
  it("fills defaults for an empty payload", () => {
    const p = ingestPayload.parse({});
    expect(p).toEqual({
      device: null,
      koreader_version: null,
      generated_at: null,
      books: [],
      sessions: [],
      annotations: [],
    });
  });

  it("applies book defaults", () => {
    const b = bookInput.parse({ md5: "abc123", title: "X" });
    expect(b.percent_finished).toBe(0);
    expect(b.status).toBeNull();
    expect(b.total_read_time).toBe(0);
    expect(b.authors).toBeNull();
  });
});

describe("validation rejections", () => {
  it("rejects a non-hex md5", () => {
    expect(bookInput.safeParse({ md5: "zzz", title: "X" }).success).toBe(false);
  });
  it("rejects an empty title", () => {
    expect(bookInput.safeParse({ md5: "abc123", title: "" }).success).toBe(false);
  });
  it("rejects out-of-range percent", () => {
    expect(bookInput.safeParse({ md5: "abc123", title: "X", percent_finished: 1.5 }).success).toBe(false);
  });
  it("accepts any status string (deriveStatus maps/falls back later)", () => {
    expect(bookInput.safeParse({ md5: "abc123", title: "X", status: "halfway" }).success).toBe(true);
  });
  it("rejects a negative duration session", () => {
    expect(sessionInput.safeParse({ md5: "abc123", page: 1, start_time: 1, duration: -1 }).success).toBe(false);
  });
  it("requires a datetime on annotations", () => {
    expect(annotationInput.safeParse({ md5: "abc123", datetime: "" }).success).toBe(false);
  });
  it("accepts a minimal valid annotation", () => {
    expect(annotationInput.safeParse({ md5: "abc123", datetime: "2026-01-01 00:00:00" }).success).toBe(true);
  });
});
