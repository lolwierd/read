// Cover resolution. Real art comes from Open Library (by ISBN when we have it, else a
// title+author search) at render time, exactly like the mockup. When there's no art we
// fall back to a coloured clothbound spine — chosen deterministically so a given book
// always wears the same colour. Pure URL/colour helpers; the actual fetch lives in web.

/** The mockup's muted clothbound family (CSS custom properties). */
export const SPINE_PALETTE = [
  "var(--oxblood)",
  "var(--slate)",
  "var(--sage)",
  "var(--ochre)",
  "var(--plum)",
  "var(--ink)",
] as const;

/** Stable spine colour for a book — same input always yields the same colour. */
export function spineColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return SPINE_PALETTE[h % SPINE_PALETTE.length]!;
}

/** Open Library cover URL for a known ISBN, or null. `?default=false` makes OL 404 on a
 *  miss so the client's onload guard keeps the coloured fallback instead of a blank. */
export function coverUrlForIsbn(isbn: string | null, size: "S" | "M" | "L" = "L"): string | null {
  if (isbn === null || isbn === "") return null;
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-${size}.jpg?default=false`;
}

/** Open Library search URL to resolve a cover id from title + author (fallback path). */
export function coverSearchUrl(title: string, author: string | null): string {
  const parts = [`title=${encodeURIComponent(title)}`, "fields=cover_i", "limit=1"];
  if (author !== null && author !== "") parts.push(`author=${encodeURIComponent(author)}`);
  return `https://openlibrary.org/search.json?${parts.join("&")}`;
}
