import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { parseKoDatetime } from "@read/core";
import { handleMcp } from "../src/mcp.js";
import type { ToolCtx } from "../src/tools.js";

// A fixed "now": 2026-06-01 20:30 IST. Sessions are placed on known IST days relative to it.
const NOW = new Date("2026-06-01T15:00:00Z");
const ctx: ToolCtx = { db: env.DB, now: () => NOW };

function session(day: string, hhmmss: string, duration: number, md5 = "abc123") {
  return { md5, page: 100, start_time: parseKoDatetime(`${day} ${hhmmss}`), duration, total_pages: 662 };
}

const PAYLOAD = {
  device: "kobo",
  koreader_version: "v2026.1",
  generated_at: 1759000000,
  books: [
    {
      md5: "abc123",
      title: "The Name of the Wind",
      authors: "Patrick Rothfuss",
      series: "The Kingkiller Chronicle",
      isbn: "9780756404741",
      pages: 662,
      percent_finished: 0.73,
      status: "reading",
      last_open: Math.floor(NOW.getTime() / 1000),
      total_read_time: 14820,
      total_read_pages: 482,
    },
    {
      md5: "def456",
      title: "Piranesi",
      authors: "Susanna Clarke",
      percent_finished: 1,
      status: "complete",
      last_open: parseKoDatetime("2026-02-10 10:00:00"),
      total_read_time: 30000,
    },
  ],
  sessions: [
    session("2026-06-01", "10:00:00", 1800),
    session("2026-05-31", "10:00:00", 1200),
    session("2026-05-30", "10:00:00", 600),
  ],
  annotations: [
    {
      md5: "abc123",
      datetime: "2026-05-26 22:45:35",
      chapter: "Chapter 8",
      page: 211,
      text: "Words are pale shadows of forgotten names.",
      pos0: "/body/p[3].0",
      pos1: "/body/p[3].42",
    },
    {
      md5: "abc123",
      datetime: "2026-05-20 10:00:00",
      chapter: "Chapter 2",
      page: 40,
      text: "A short line.",
      note: "love this",
      pos0: "/body/p[1].0",
    },
    // A note-only entry with NO pos0 — must still dedupe on re-ingest (coerced to "").
    {
      md5: "def456",
      datetime: "2026-02-09 12:00:00",
      chapter: "Part 1",
      page: 10,
      text: null,
      note: "a bare bookmark, no position",
    },
  ],
};

async function ingest(token: string, body: unknown): Promise<Response> {
  return SELF.fetch("https://read-mcp.test/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function rpc(method: string, params: unknown = {}, id: number | null = 1) {
  const req = new Request("https://read-mcp.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const res = await handleMcp(req, ctx);
  return res.json() as Promise<{ result?: any; error?: any }>;
}

async function callTool(name: string, args: unknown = {}) {
  const out = await rpc("tools/call", { name, arguments: args });
  return out.result?.structuredContent;
}

describe("/ingest", () => {
  it("rejects a missing/wrong token", async () => {
    expect((await ingest("nope", PAYLOAD)).status).toBe(401);
    const noAuth = await SELF.fetch("https://read-mcp.test/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PAYLOAD),
    });
    expect(noAuth.status).toBe(401);
  });

  it("rejects malformed JSON and invalid payloads", async () => {
    const bad = await SELF.fetch("https://read-mcp.test/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: "{not json",
    });
    expect(bad.status).toBe(400);
    const invalid = await ingest("test-token", { books: [{ md5: "zzz", title: "" }] });
    expect(invalid.status).toBe(400);
  });

  it("accepts a valid payload and reports counts", async () => {
    const res = await ingest("test-token", PAYLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, books: 2, sessions: 3, annotations: 3 });
  });

  it("is idempotent — re-sending dedupes sessions/annotations (incl. NULL-pos0 entries)", async () => {
    await ingest("test-token", PAYLOAD);
    await ingest("test-token", PAYLOAD);
    const s = await env.DB.prepare("SELECT COUNT(*) AS c FROM sessions").first<{ c: number }>();
    const a = await env.DB.prepare("SELECT COUNT(*) AS c FROM annotations").first<{ c: number }>();
    expect(s?.c).toBe(3);
    expect(a?.c).toBe(3); // would be 4 (the pos0-less entry re-inserts) before the "" coercion fix
  });

  it("accepts an unrecognized KOReader status without rejecting the batch", async () => {
    const res = await ingest("test-token", {
      books: [{ md5: "beef00", title: "Odd Status", status: "mbr", percent_finished: 0.5 }],
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT status FROM books WHERE md5='beef00'").first<{ status: string }>();
    expect(row?.status).toBe("reading"); // unknown status → progress-based inference
  });
});

describe("covers (R2)", () => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  async function putCover(token: string, md5: string, body: BodyInit): Promise<Response> {
    return SELF.fetch(`https://read-mcp.test/cover/${md5}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}` },
      body,
    });
  }

  it("rejects unauthorized / bad md5 / empty body", async () => {
    expect((await putCover("nope", "abcdef", fakeJpeg)).status).toBe(401);
    expect((await putCover("test-token", "not-hex!", fakeJpeg)).status).toBe(400);
    expect((await putCover("test-token", "abcdef", new Uint8Array())).status).toBe(400);
  });

  it("stores a cover, sets the book's cover_url, and lists it in /covers", async () => {
    await ingest("test-token", PAYLOAD); // creates abc123
    const res = await putCover("test-token", "abc123", fakeJpeg);
    expect(res.status).toBe(200);
    const stored = await env.DB.prepare("SELECT length(bytes) AS n FROM covers WHERE md5='abc123'").first<{ n: number }>();
    expect(stored?.n).toBe(fakeJpeg.byteLength);

    const row = await env.DB.prepare("SELECT cover_url FROM books WHERE md5='abc123'").first<{ cover_url: string }>();
    expect(row?.cover_url).toBe("https://read.lolwierd.com/cover/abc123");

    const list = await SELF.fetch("https://read-mcp.test/covers", {
      headers: { Authorization: "Bearer test-token" },
    });
    const body = (await list.json()) as { have: string[] };
    expect(body.have).toContain("abc123");
  });
});

describe("MCP protocol", () => {
  it("initialize echoes the requested protocol version", async () => {
    const out = await rpc("initialize", { protocolVersion: "2024-11-05" });
    expect(out.result.protocolVersion).toBe("2024-11-05");
    expect(out.result.serverInfo.name).toBe("read-mcp");
  });
  it("tools/list exposes the tools", async () => {
    const out = await rpc("tools/list");
    const names = out.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["now_reading", "list_books", "get_book", "search_highlights", "reading_stats", "search", "fetch"]),
    );
  });
  it("rejects an unknown tool and bad args", async () => {
    expect((await rpc("tools/call", { name: "nope" })).error.code).toBe(-32602);
    const badArgs = await rpc("tools/call", { name: "get_book", arguments: {} });
    expect(badArgs.result.isError).toBe(true);
  });
  it("acks a notification with no response (202)", async () => {
    const req = new Request("https://read-mcp.test/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect((await handleMcp(req, ctx)).status).toBe(202);
  });
});

describe("tools over real D1", () => {
  beforeEach(async () => {
    // Reset to a known state — earlier suites share this D1 (FK-cascades sessions/annotations).
    await env.DB.prepare("DELETE FROM books").run();
    await ingest("test-token", PAYLOAD);
  });

  it("reading_stats computes streak/week/today/year", async () => {
    const stats = await callTool("reading_stats");
    expect(stats.minutesToday).toBe(30);
    expect(stats.streakDays).toBe(3);
    expect(stats.weekMinutes).toBe(60);
    expect(stats.booksThisYear).toBe(1); // Piranesi finished in 2026
    expect(stats.linesKept).toBe(3);
    expect(stats.week).toHaveLength(7);
  });

  it("now_reading returns the book in hand + its highlights", async () => {
    const out = await callTool("now_reading");
    expect(out.now_reading.title).toBe("The Name of the Wind");
    expect(out.now_reading.percent).toBe(73);
    expect(out.recent_highlights.length).toBe(2);
  });

  it("list_books filters by status", async () => {
    const all = await callTool("list_books");
    expect(all.books).toHaveLength(2);
    const finished = await callTool("list_books", { status: "finished" });
    expect(finished.books).toHaveLength(1);
    expect(finished.books[0].title).toBe("Piranesi");
  });

  it("get_book returns detail + all highlights", async () => {
    const out = await callTool("get_book", { md5: "abc123" });
    expect(out.book.title).toBe("The Name of the Wind");
    expect(out.highlights).toHaveLength(2);
    const missing = await callTool("get_book", { md5: "ffffff" });
    expect(missing.error).toBe("not found");
  });

  it("search_highlights matches text and note", async () => {
    const byText = await callTool("search_highlights", { query: "names" });
    expect(byText.matches.length).toBeGreaterThanOrEqual(1);
    const byNote = await callTool("search_highlights", { query: "love" });
    expect(byNote.matches.length).toBeGreaterThanOrEqual(1);
  });

  it("search + fetch (ChatGPT contract)", async () => {
    const s = await callTool("search", { query: "wind" });
    expect(s.results.some((r: { id: string }) => r.id === "book:abc123")).toBe(true);
    const f = await callTool("fetch", { id: "book:abc123" });
    expect(f.title).toBe("The Name of the Wind");
    expect(f.text).toContain("Words are pale shadows");
  });
});
