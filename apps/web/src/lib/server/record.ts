// Read-only D1 → RecordView for SSR. All math comes from @read/core so the dashboard
// and the MCP's reading_stats agree to the number.

import {
  buildRecordView,
  recentHighlights,
  toBookView,
  type Annotation,
  type Book,
  type BookStatus,
  type BookView,
  type HighlightView,
  type RecordView,
  type Session,
} from "@read/core";
import type { D1Database } from "@cloudflare/workers-types";

type Row = Record<string, unknown>;
const n = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const nOrNull = (v: unknown): number | null => (v == null ? null : n(v));
const sOrNull = (v: unknown): string | null => (v == null ? null : String(v));

function mapBook(r: Row): Book {
  return {
    md5: String(r["md5"]),
    title: String(r["title"]),
    authors: sOrNull(r["authors"]),
    series: sOrNull(r["series"]),
    language: sOrNull(r["language"]),
    isbn: sOrNull(r["isbn"]),
    pages: nOrNull(r["pages"]),
    percent_finished: n(r["percent_finished"]),
    status: String(r["status"]) as BookStatus,
    rating: nOrNull(r["rating"]),
    review: sOrNull(r["review"]),
    last_open: nOrNull(r["last_open"]),
    total_read_time: n(r["total_read_time"]),
    total_read_pages: n(r["total_read_pages"]),
    current_chapter: sOrNull(r["current_chapter"]),
    cover_url: sOrNull(r["cover_url"]),
  };
}
function mapSession(r: Row): Session {
  return {
    book_md5: String(r["book_md5"]),
    page: n(r["page"]),
    start_time: n(r["start_time"]),
    duration: n(r["duration"]),
    total_pages: n(r["total_pages"]),
  };
}
function mapAnnotation(r: Row): Annotation {
  return {
    book_md5: String(r["book_md5"]),
    datetime: String(r["datetime"]),
    datetime_epoch: n(r["datetime_epoch"]),
    chapter: sOrNull(r["chapter"]),
    page: nOrNull(r["page"]),
    text: sOrNull(r["text"]),
    note: sOrNull(r["note"]),
    color: sOrNull(r["color"]),
    pos0: sOrNull(r["pos0"]),
    pos1: sOrNull(r["pos1"]),
  };
}

export async function loadRecord(db: D1Database, now: Date): Promise<RecordView> {
  const [b, s, a] = await Promise.all([
    db.prepare("SELECT * FROM books").all<Row>(),
    db.prepare("SELECT book_md5,page,start_time,duration,total_pages FROM sessions").all<Row>(),
    db.prepare("SELECT * FROM annotations ORDER BY datetime_epoch DESC").all<Row>(),
  ]);
  return buildRecordView(b.results.map(mapBook), s.results.map(mapSession), a.results.map(mapAnnotation), now);
}

export interface BookPage {
  book: BookView;
  rating: number | null;
  review: string | null;
  highlights: HighlightView[];
}

export async function loadBook(db: D1Database, md5: string): Promise<BookPage | null> {
  const br = await db.prepare("SELECT * FROM books WHERE md5 = ?").bind(md5).all<Row>();
  if (!br.results[0]) return null;
  const book = mapBook(br.results[0]);
  const ar = await db
    .prepare("SELECT * FROM annotations WHERE book_md5 = ? ORDER BY datetime_epoch DESC")
    .bind(md5)
    .all<Row>();
  const anns = ar.results.map(mapAnnotation);
  const byMd5 = new Map([[book.md5, book]]);
  return {
    book: toBookView(book),
    rating: book.rating,
    review: book.review,
    highlights: recentHighlights(anns, byMd5, anns.length),
  };
}
