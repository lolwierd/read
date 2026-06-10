// D1 data-access layer. Pure functions over a D1Database; all domain logic stays in
// @read/core. Ingest upserts by md5 and dedupes sessions/annotations on natural keys,
// so re-sending the whole payload is safe.

import {
  toAnnotation,
  toBook,
  toSession,
  type Annotation,
  type Book,
  type BookStatus,
  type IngestPayload,
  type Session,
} from "@read/core";

type Row = Record<string, unknown>;
const n = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const nOrNull = (v: unknown): number | null => (v == null ? null : n(v));
const sOrNull = (v: unknown): string | null => (v == null ? null : String(v));

export function mapBook(r: Row): Book {
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

export function mapAnnotation(r: Row): Annotation {
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

/** Run prepared statements in FK-safe order, chunked to stay within D1 batch limits. */
async function chunkedBatch(db: D1Database, stmts: D1PreparedStatement[], size = 50): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) {
    await db.batch(stmts.slice(i, i + size));
  }
}

export interface IngestCounts {
  books: number;
  sessions: number;
  annotations: number;
}

/** Upsert a validated ingest payload. Books first (so session/annotation FKs resolve),
 *  then sessions, then annotations, then an audit row. */
export async function upsertIngest(db: D1Database, payload: IngestPayload): Promise<IngestCounts> {
  const books = payload.books.map(toBook);
  const sessions = payload.sessions.map(toSession);
  const annotations = payload.annotations.map((a) => toAnnotation(a));

  const bookStmt = db.prepare(
    `INSERT INTO books
       (md5,title,authors,series,language,isbn,pages,percent_finished,status,rating,review,
        last_open,total_read_time,total_read_pages,current_chapter,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(md5) DO UPDATE SET
       title=excluded.title,
       authors=COALESCE(excluded.authors, books.authors),
       series=COALESCE(excluded.series, books.series),
       language=COALESCE(excluded.language, books.language),
       isbn=COALESCE(excluded.isbn, books.isbn),
       pages=COALESCE(excluded.pages, books.pages),
       percent_finished=excluded.percent_finished,
       status=excluded.status,
       rating=COALESCE(excluded.rating, books.rating),
       review=COALESCE(excluded.review, books.review),
       last_open=excluded.last_open,
       total_read_time=excluded.total_read_time,
       total_read_pages=excluded.total_read_pages,
       current_chapter=COALESCE(excluded.current_chapter, books.current_chapter),
       updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
  );
  await chunkedBatch(
    db,
    books.map((b) =>
      bookStmt.bind(
        b.md5, b.title, b.authors, b.series, b.language, b.isbn, b.pages,
        b.percent_finished, b.status, b.rating, b.review, b.last_open,
        b.total_read_time, b.total_read_pages, b.current_chapter,
      ),
    ),
  );

  const sessStmt = db.prepare(
    `INSERT OR IGNORE INTO sessions (book_md5,page,start_time,duration,total_pages) VALUES (?,?,?,?,?)`,
  );
  await chunkedBatch(
    db,
    sessions.map((s) => sessStmt.bind(s.book_md5, s.page, s.start_time, s.duration, s.total_pages)),
  );

  const annStmt = db.prepare(
    `INSERT OR IGNORE INTO annotations
       (book_md5,datetime,datetime_epoch,chapter,page,text,note,color,pos0,pos1)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  await chunkedBatch(
    db,
    annotations.map((a) =>
      annStmt.bind(
        a.book_md5, a.datetime, a.datetime_epoch, a.chapter, a.page, a.text, a.note, a.color, a.pos0, a.pos1,
      ),
    ),
  );

  await db
    .prepare(
      `INSERT INTO ingest_log (device,koreader_version,generated_at,books_n,sessions_n,annotations_n)
       VALUES (?,?,?,?,?,?)`,
    )
    .bind(payload.device, payload.koreader_version, payload.generated_at, books.length, sessions.length, annotations.length)
    .run();

  return { books: books.length, sessions: sessions.length, annotations: annotations.length };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getViewData(
  db: D1Database,
): Promise<{ books: Book[]; sessions: Session[]; annotations: Annotation[] }> {
  const [b, s, a] = await Promise.all([
    db.prepare("SELECT * FROM books").all<Row>(),
    db.prepare("SELECT book_md5,page,start_time,duration,total_pages FROM sessions").all<Row>(),
    db.prepare("SELECT * FROM annotations ORDER BY datetime_epoch DESC").all<Row>(),
  ]);
  return {
    books: b.results.map(mapBook),
    sessions: s.results.map(mapSession),
    annotations: a.results.map(mapAnnotation),
  };
}

export async function getBook(db: D1Database, md5: string): Promise<Book | null> {
  const r = await db.prepare("SELECT * FROM books WHERE md5 = ?").bind(md5).all<Row>();
  return r.results[0] ? mapBook(r.results[0]) : null;
}

export async function getBookAnnotations(db: D1Database, md5: string): Promise<Annotation[]> {
  const r = await db
    .prepare("SELECT * FROM annotations WHERE book_md5 = ? ORDER BY datetime_epoch DESC")
    .bind(md5)
    .all<Row>();
  return r.results.map(mapAnnotation);
}

/** FTS search over highlight text + note. The query is treated as a set of LITERAL terms
 *  (each token double-quoted) so a user's `:`, `*`, `NEAR`, `AND/OR` etc. can't change the
 *  FTS5 query semantics. Falls back to an escaped LIKE scan if FTS can't parse the query. */
export async function searchAnnotations(db: D1Database, query: string, limit = 20): Promise<Annotation[]> {
  const tokens = query.split(/\s+/).filter((t) => t.replace(/[^\p{L}\p{N}]/gu, "") !== "");
  if (tokens.length === 0) return [];
  const fts = tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" ");
  try {
    const r = await db
      .prepare(
        `SELECT a.* FROM annotations_fts f JOIN annotations a ON a.id = f.rowid
         WHERE annotations_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .bind(fts, limit)
      .all<Row>();
    return r.results.map(mapAnnotation);
  } catch {
    // Escape LIKE metacharacters so a query with % or _ matches them literally.
    const esc = query.replace(/[\\%_]/g, (m) => `\\${m}`);
    const like = `%${esc}%`;
    const r = await db
      .prepare(
        `SELECT * FROM annotations WHERE text LIKE ?1 ESCAPE '\\' OR note LIKE ?1 ESCAPE '\\'
         ORDER BY datetime_epoch DESC LIMIT ?2`,
      )
      .bind(like, limit)
      .all<Row>();
    return r.results.map(mapAnnotation);
  }
}
