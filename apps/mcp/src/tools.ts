// MCP tool registry. Each tool = a Zod input schema + a handler over the D1 layer and
// @read/core rollups. Handlers return plain data; mcp.ts validates input and wraps it.
// Read-only — the only writes happen through /ingest.

import { z } from "zod";
import { buildRecordView, recentHighlights, toBookView } from "@read/core";
import * as db from "./db.js";

export interface ToolCtx {
  db: D1Database;
  now: () => Date;
}

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType<unknown>;
  handler: (ctx: ToolCtx, input: unknown) => Promise<unknown>;
}

function tool<S extends z.ZodType<unknown>>(
  name: string,
  description: string,
  schema: S,
  handler: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown>,
): ToolDef {
  return { name, description, schema, handler: (ctx, input) => handler(ctx, input as z.infer<S>) };
}

const statusEnum = z.enum(["unread", "reading", "finished", "paused", "abandoned"]);
const WEB = "https://read.example.com";

export const TOOLS: ToolDef[] = [
  tool(
    "now_reading",
    "The book currently in hand: title, author, progress %, hours spent, resume chapter, and its most recent highlights.",
    z.object({}),
    async (ctx) => {
      const { books, sessions, annotations } = await db.getViewData(ctx.db);
      const view = buildRecordView(books, sessions, annotations, ctx.now());
      if (view.now === null) return { now_reading: null };
      const byMd5 = new Map(books.map((b) => [b.md5, b]));
      const recent = recentHighlights(
        annotations.filter((a) => a.book_md5 === view.now!.md5),
        byMd5,
        5,
      );
      return { now_reading: view.now, recent_highlights: recent };
    },
  ),

  tool(
    "list_books",
    "List the shelf — every tracked book with status, progress %, hours read and cover. Optionally filter by status.",
    z.object({ status: statusEnum.optional() }),
    async (ctx, input) => {
      const { books } = await db.getViewData(ctx.db);
      const filtered = input.status ? books.filter((b) => b.status === input.status) : books;
      return { books: filtered.map(toBookView) };
    },
  ),

  tool(
    "get_book",
    "Full detail for one book by its md5 id: metadata, progress, ratings/review, and all its highlights + notes (newest first).",
    z.object({ md5: z.string().min(1) }),
    async (ctx, input) => {
      const book = await db.getBook(ctx.db, input.md5);
      if (book === null) return { error: "not found" };
      const byMd5 = new Map([[book.md5, book]]);
      const anns = await db.getBookAnnotations(ctx.db, input.md5);
      return {
        book: toBookView(book),
        review: book.review,
        rating: book.rating,
        highlights: recentHighlights(anns, byMd5, anns.length),
      };
    },
  ),

  tool(
    "search_highlights",
    "Full-text search across all saved highlights and notes. Returns matching passages with their book and chapter.",
    z.object({ query: z.string().min(1), limit: z.number().int().positive().max(100).default(20) }),
    async (ctx, input) => {
      const { books } = await db.getViewData(ctx.db);
      const byMd5 = new Map(books.map((b) => [b.md5, b]));
      const anns = await db.searchAnnotations(ctx.db, input.query, input.limit);
      return { matches: recentHighlights(anns, byMd5, anns.length) };
    },
  ),

  tool(
    "reading_stats",
    "Reading statistics: minutes read today, current streak, the trailing-7-day chart, total minutes this week, books finished this year, and total highlights kept.",
    z.object({}),
    async (ctx) => {
      const { books, sessions, annotations } = await db.getViewData(ctx.db);
      return buildRecordView(books, sessions, annotations, ctx.now()).stats;
    },
  ),

  // ── ChatGPT/OpenAI connector contract ──
  tool(
    "search",
    "Search the reading record (books + highlights). Returns id/title/url results for the fetch tool.",
    z.object({ query: z.string() }),
    async (ctx, input) => {
      const q = input.query.toLowerCase().trim();
      const { books } = await db.getViewData(ctx.db);
      const bookHits = books
        .filter((b) => q === "" || b.title.toLowerCase().includes(q) || (b.authors ?? "").toLowerCase().includes(q))
        .slice(0, 10)
        .map((b) => ({ id: `book:${b.md5}`, title: b.title, url: `${WEB}/book/${b.md5}` }));
      const hlHits = (await db.searchAnnotations(ctx.db, input.query, 10)).map((a, i) => ({
        id: `hl:${a.book_md5}:${i}`,
        title: (a.text ?? a.note ?? "highlight").slice(0, 80),
        url: `${WEB}/book/${a.book_md5}`,
      }));
      return { results: [...bookHits, ...hlHits] };
    },
  ),

  tool(
    "fetch",
    "Fetch the full content of a search result by id (book:<md5>).",
    z.object({ id: z.string() }),
    async (ctx, input) => {
      const m = /^book:(.+)$/.exec(input.id);
      const md5 = m ? m[1]! : input.id.replace(/^hl:/, "").split(":")[0]!;
      const book = await db.getBook(ctx.db, md5);
      if (book === null) return { id: input.id, title: "Not found", text: "", url: WEB };
      const anns = await db.getBookAnnotations(ctx.db, md5);
      const lines = anns
        .filter((a) => a.text || a.note)
        .map((a) => `• ${a.text ?? ""}${a.note ? ` — (note: ${a.note})` : ""}${a.chapter ? ` [${a.chapter}]` : ""}`);
      const text =
        `${book.title}${book.authors ? ` by ${book.authors}` : ""}\n` +
        `Status: ${book.status} · ${Math.round(book.percent_finished * 100)}% · ` +
        `${Math.round(book.total_read_time / 360) / 10}h read\n\nHighlights:\n${lines.join("\n")}`;
      return { id: `book:${md5}`, title: book.title, text, url: `${WEB}/book/${md5}` };
    },
  ),
];

export const TOOLS_BY_NAME: Map<string, ToolDef> = new Map(TOOLS.map((t) => [t.name, t]));
