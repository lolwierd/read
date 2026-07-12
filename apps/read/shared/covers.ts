// Cover matching + web fallback, shared by the dev cover-sync (ssh to miso) and the prod
// miso builder (local Calibre). Matching is pure; fetchers use global fetch. No file I/O
// here — callers read the matched cover bytes (local file or ssh) themselves.

export interface KoBook {
  md5: string;
  title: string;
  authors: string | null;
  isbn: string | null;
}

export interface CalBook {
  id: number;
  title: string;
  author: string;
  path: string;
  isbn: string;
  tags?: string[];
  publisher?: string | null;
  publishedYear?: number | null;
  series?: string | null;
  seriesIndex?: number | null;
}

export const normTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|complete|classic|guide|edition|vol|volume)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normIsbn = (s: string | null): string => (s ? s.replace(/[^0-9Xx]/g, "").toUpperCase() : "");

const lastName = (a: string | null): string =>
  a ? (a.split(/[,&\n]/)[0] ?? "").trim().split(/\s+/).pop()?.toLowerCase() ?? "" : "";

/** Best Calibre match for a KOReader book: ISBN, then exact normalized title, then a loose
 *  contains-match guarded by the author surname. Returns null when nothing is confident. */
export function matchCalibre(ko: KoBook, cal: CalBook[]): CalBook | null {
  const isbn = normIsbn(ko.isbn);
  if (isbn) {
    const hit = cal.find((c) => normIsbn(c.isbn) === isbn);
    if (hit) return hit;
  }
  const nt = normTitle(ko.title);
  if (!nt) return null;
  const exact = cal.filter((c) => normTitle(c.title) === nt);
  const ln = lastName(ko.authors);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return exact.find((c) => c.author.toLowerCase().includes(ln)) ?? exact[0]!;
  const loose = cal.filter((c) => {
    const ct = normTitle(c.title);
    return (ct.includes(nt) || nt.includes(ct)) && nt.length > 4;
  });
  if (loose.length && ln) return loose.find((c) => c.author.toLowerCase().includes(ln)) ?? null;
  return loose.length === 1 ? loose[0]! : null;
}

// ── web fallback (manga & anything not in Calibre) ────────────────────────────
/** Strip volume/chapter noise so a search engine can find the series. */
export function searchTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(vol|volume|chapter|ch|no|color|colour|complete|box ?set)\b\.?/gi, " ")
    .replace(/\d+\s*[-–]\s*\d+/g, " ")
    .replace(/[#]?\d+\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Things that aren't books and should keep their cloth spine. */
export function skipWeb(title: string): boolean {
  return /quick ?start|myscript|-(regular|bold|italic|medium)\b|^chapter\s+\d+$/i.test(title.trim());
}

async function download(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url.replace(/^http:/, "https:"));
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return b.byteLength > 500 ? b : null;
  } catch {
    return null;
  }
}

async function anilistCover(title: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: `query($s:String){Media(search:$s,type:MANGA){coverImage{extraLarge large}}}`,
        variables: { s: title },
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { Media?: { coverImage?: { extraLarge?: string; large?: string } } } };
    const u = j.data?.Media?.coverImage?.extraLarge ?? j.data?.Media?.coverImage?.large;
    return u ? download(u) : null;
  } catch {
    return null;
  }
}

async function googleBooksCover(title: string, author: string | null): Promise<Uint8Array | null> {
  try {
    const q = `intitle:${title}${author ? `+inauthor:${author.split(/[,&]/)[0]!.trim()}` : ""}`;
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`);
    if (!r.ok) return null;
    const j = (await r.json()) as { items?: { volumeInfo?: { imageLinks?: Record<string, string> } }[] };
    const links = j.items?.[0]?.volumeInfo?.imageLinks;
    const u = links?.thumbnail ?? links?.smallThumbnail;
    return u ? download(`${u}${u.includes("zoom=") ? "" : "&zoom=2"}`) : null;
  } catch {
    return null;
  }
}

/** Best-effort web cover for a book Calibre doesn't have. AniList (manga) → Google Books. */
export async function webCover(ko: KoBook): Promise<{ bytes: Uint8Array; via: string } | null> {
  const t = searchTitle(ko.title);
  if (!t || skipWeb(ko.title)) return null;
  const a = await anilistCover(t);
  if (a) return { bytes: a, via: "anilist" };
  const g = await googleBooksCover(t, ko.authors);
  if (g) return { bytes: g, via: "googlebooks" };
  return null;
}
