// KOReader payload → storage normalizers. The Lua plugin reads the lua tables and sends
// JSON; here we turn validated input into the rows we persist, and derive canonical
// status. Pure functions — no I/O.

import type { Annotation, Book, BookStatus, Session } from "./types.js";
import type { AnnotationInput, BookInput, SessionInput } from "./schemas.js";
import { parseKoDatetime, READING_TZ } from "./time.js";

const FINISHED_PCT = 0.99; // KOReader marks ~complete near 1.0; treat ≥99% as finished

/** Derive our canonical status from KOReader's summary status + progress. The explicit
 *  summary status wins when meaningful; otherwise progress decides. */
export function deriveStatus(koStatus: string | null, percent: number): BookStatus {
  switch (koStatus) {
    case "complete":
    case "finished":
      return "finished";
    case "abandoned":
      return "abandoned";
    case "on_hold":
    case "paused":
      return "paused";
    case "tbr":
      return "unread";
    // "reading" or null → fall through to progress-based inference
  }
  if (percent >= FINISHED_PCT) return "finished";
  if (percent > 0) return "reading";
  return "unread";
}

/** Collapse whitespace and KOReader's "\n"-joined multi-author strings to a tidy line. */
export function normalizeAuthors(authors: string | null): string | null {
  if (authors === null) return null;
  const cleaned = authors
    .replace(/\\n|\n/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(^,\s*)|(,\s*$)/g, "")
    .trim();
  return cleaned === "" ? null : cleaned;
}

/** Pull a 10/13-digit ISBN out of whatever doc_props identifier string KOReader gives.
 *  KOReader joins multiple identifiers with newlines, e.g.
 *  "uuid:…\ncalibre:…\nISBN:9780486406534" — so we must prefer the ISBN-labelled value
 *  and NOT just scrape digits from the whole blob (a uuid's digit runs would win). */
export function normalizeIsbn(isbn: string | null): string | null {
  if (isbn === null) return null;
  // 1) Explicitly labelled ISBN wins.
  const labelled = /isbn[:\s]*([0-9][0-9\- ]{8,}[0-9Xx])/i.exec(isbn);
  if (labelled) {
    const d = labelled[1]!.replace(/[^0-9Xx]/g, "").toUpperCase();
    if (d.length === 13 || d.length === 10) return d;
  }
  // 2) The whole value cleans to exactly a 10/13 ISBN (a bare identifier).
  const digits = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length === 13 || digits.length === 10) return digits;
  // 3) A real ISBN-13 embedded somewhere (require the 978/979 boundary so a uuid's
  //    arbitrary digit run can't masquerade as an ISBN).
  const m = /(97[89]\d{10})/.exec(isbn.replace(/[\s-]/g, ""));
  return m ? m[1]! : null;
}

export function toBook(input: BookInput): Book {
  return {
    md5: input.md5,
    title: input.title.trim(),
    authors: normalizeAuthors(input.authors),
    series: input.series?.trim() || null,
    language: input.language?.trim() || null,
    isbn: normalizeIsbn(input.isbn),
    pages: input.pages,
    percent_finished: input.percent_finished,
    status: deriveStatus(input.status, input.percent_finished),
    rating: input.rating,
    review: input.review?.trim() || null,
    last_open: input.last_open,
    total_read_time: input.total_read_time,
    total_read_pages: input.total_read_pages,
    current_chapter: input.current_chapter?.trim() || null,
    cover_url: null, // resolved later (Open Library), cached on the row
  };
}

export function toSession(input: SessionInput): Session {
  return {
    book_md5: input.md5,
    page: input.page,
    start_time: input.start_time,
    duration: input.duration,
    total_pages: input.total_pages,
  };
}

export function toAnnotation(input: AnnotationInput, tz: string = READING_TZ): Annotation {
  const text = input.text?.trim() || null;
  const note = input.note?.trim() || null;
  return {
    book_md5: input.md5,
    datetime: input.datetime.trim(),
    datetime_epoch: parseKoDatetime(input.datetime, tz),
    chapter: input.chapter?.trim() || null,
    page: input.page,
    text,
    note,
    color: input.color?.trim() || null,
    // pos0 is part of the (book_md5, datetime, pos0) dedupe key. SQLite treats NULLs as
    // distinct in a UNIQUE index, so a NULL pos0 (bare bookmark / note-only entry) would
    // re-insert on every sync. Coerce to "" so the key actually dedupes.
    pos0: input.pos0 ?? "",
    pos1: input.pos1,
  };
}

/** A sidecar entry with neither highlighted text nor a note is a bare bookmark — not
 *  something worth surfacing in the Margins. Callers can use this to filter. */
export function isMeaningfulAnnotation(a: Annotation): boolean {
  return (a.text !== null && a.text !== "") || (a.note !== null && a.note !== "");
}
