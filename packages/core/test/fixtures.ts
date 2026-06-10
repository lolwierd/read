// Test fixture builders — terse helpers so each test states only what it cares about.

import type { Annotation, Book, Session } from "../src/types.js";
import { parseKoDatetime } from "../src/time.js";

export function book(over: Partial<Book> = {}): Book {
  return {
    md5: "abc123",
    title: "The Name of the Wind",
    authors: "Patrick Rothfuss",
    series: "The Kingkiller Chronicle",
    language: "en",
    isbn: "9780756404741",
    pages: 662,
    percent_finished: 0.73,
    status: "reading",
    rating: null,
    review: null,
    last_open: parseKoDatetime("2026-06-01 21:00:00"),
    total_read_time: 14820,
    total_read_pages: 482,
    current_chapter: "Chapter 12",
    cover_url: null,
    ...over,
  };
}

/** A session on a given IST wall-clock day/time. */
export function session(day: string, hhmmss: string, duration: number, over: Partial<Session> = {}): Session {
  return {
    book_md5: "abc123",
    page: 100,
    start_time: parseKoDatetime(`${day} ${hhmmss}`),
    duration,
    total_pages: 662,
    ...over,
  };
}

export function annotation(over: Partial<Annotation> = {}): Annotation {
  const datetime = over.datetime ?? "2026-05-26 22:45:35";
  return {
    book_md5: "abc123",
    datetime,
    datetime_epoch: parseKoDatetime(datetime),
    chapter: "Chapter 8",
    page: 211,
    text: "Words are pale shadows of forgotten names.",
    note: null,
    color: "yellow",
    pos0: "/body/DocFragment[8]/body/p[3]/text().0",
    pos1: "/body/DocFragment[8]/body/p[3]/text().42",
    ...over,
  };
}
