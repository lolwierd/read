// Zod schemas for the ingest payload (plugin → /ingest). The single source of truth
// for the wire shape; the Worker validates against these before any upsert.

import { z } from "zod";

const md5 = z.string().regex(/^[a-f0-9]{6,64}$/i, "expected a hex md5");
const epochSeconds = z.number().int().nonnegative();

/** KOReader summary status string (free-form — versions/variants differ). `deriveStatus`
 *  maps the known ones and falls back to progress for anything else, so we accept any
 *  string rather than 400 the whole batch on an unrecognized status. */
export const koStatus = z.string().nullable().default(null);

export const bookInput = z.object({
  md5,
  title: z.string().min(1),
  authors: z.string().nullable().default(null),
  series: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
  isbn: z.string().nullable().default(null),
  pages: z.number().int().positive().nullable().default(null),
  percent_finished: z.number().min(0).max(1).default(0),
  status: koStatus,
  rating: z.number().min(0).max(5).nullable().default(null),
  review: z.string().nullable().default(null),
  last_open: epochSeconds.nullable().default(null),
  total_read_time: epochSeconds.default(0),
  total_read_pages: z.number().int().nonnegative().default(0),
  current_chapter: z.string().nullable().default(null),
});
export type BookInput = z.infer<typeof bookInput>;

export const sessionInput = z.object({
  md5,
  page: z.number().int().nonnegative(),
  start_time: epochSeconds,
  duration: epochSeconds,
  total_pages: z.number().int().nonnegative().default(0),
});
export type SessionInput = z.infer<typeof sessionInput>;

export const annotationInput = z.object({
  md5,
  datetime: z.string().min(1),
  chapter: z.string().nullable().default(null),
  page: z.number().int().nonnegative().nullable().default(null),
  text: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  pos0: z.string().nullable().default(null),
  pos1: z.string().nullable().default(null),
});
export type AnnotationInput = z.infer<typeof annotationInput>;

export const ingestPayload = z.object({
  device: z.string().nullable().default(null),
  koreader_version: z.string().nullable().default(null),
  generated_at: epochSeconds.nullable().default(null),
  books: z.array(bookInput).default([]),
  sessions: z.array(sessionInput).default([]),
  annotations: z.array(annotationInput).default([]),
});
export type IngestPayload = z.infer<typeof ingestPayload>;
