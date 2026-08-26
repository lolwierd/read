// DEV cover sync (run from the Mac): pull covers from Calibre on `miso` (over ssh) into
// public/covers/<md5>.jpg so the dev shelf has art. `--web` adds the AniList/Google Books
// fallback for books Calibre lacks (manga, etc.). Pure matching/fetching lives in
// shared/covers; this script owns the ssh/local I/O.
//
//   bun run scripts/sync-calibre-covers.ts --source fixture --target local --web --dry
//   bun run scripts/sync-calibre-covers.ts --source fixture --target local --web
//
// (Prod covers are handled by scripts/build-record.ts on miso, not this script.)

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { matchCalibre, searchTitle, skipWeb, webCover, type CalBook, type KoBook } from "../shared/covers.ts";

const SSH_HOST = process.env.MISO_HOST ?? "miso";
const LIB = process.env.CALIBRE_LIB ?? "/home/ubuntu/media/books/calibre-library";
const BASE = process.env.READ_MCP_BASE ?? "https://read.example.com";

const HERE = new URL(".", import.meta.url).pathname;
const FIXTURE = `${HERE}../../../fixtures/real/statistics.sqlite3`;
const COVERS_DIR = `${HERE}../public/covers`;

const args = new Set(process.argv.slice(2));
const opt = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const source = opt("source", "fixture");
const target = opt("target", "local");
const dry = args.has("--dry");
const web = args.has("--web");

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

async function sh(cmd: string[]): Promise<{ out: Uint8Array; code: number }> {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = new Uint8Array(await new Response(p.stdout).arrayBuffer());
  const code = await p.exited;
  return { out, code };
}

async function koBooks(): Promise<KoBook[]> {
  if (source === "fixture") {
    const db = new Database(FIXTURE, { readonly: true });
    return db
      .query<{ md5: string; title: string; authors: string | null }, []>("SELECT md5, title, authors FROM book")
      .all()
      .map((r) => ({ ...r, isbn: null }));
  }
  const { out, code } = await sh([
    "pnpm", "exec", "wrangler", "d1", "execute", "read-db", "--remote", "--json",
    "--command", "SELECT md5,title,authors,isbn FROM books",
  ]);
  if (code !== 0) throw new Error("wrangler d1 query failed");
  const parsed = JSON.parse(new TextDecoder().decode(out));
  return (Array.isArray(parsed) ? parsed[0]?.results ?? [] : parsed?.results ?? []) as KoBook[];
}

async function calibreCatalog(): Promise<CalBook[]> {
  const clean = (c: string) => `replace(replace(replace(${c},char(10),' '),char(13),' '),char(9),' ')`;
  const sql =
    `SELECT b.id, ${clean("b.title")}, ${clean("b.author_sort")}, b.path, ` +
    "(SELECT i.val FROM identifiers i WHERE i.book=b.id AND i.type='isbn' LIMIT 1) FROM books b";
  const p = Bun.spawn(["ssh", SSH_HOST, `sqlite3 -separator $'\\t' ${sq(`${LIB}/metadata.db`)}`], {
    stdin: new TextEncoder().encode(sql),
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(p.stdout).text();
  await p.exited;
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, title, author, path, isbn] = line.split("\t");
      return { id: Number(id), title: title ?? "", author: author ?? "", path: path ?? "", isbn: isbn ?? "" };
    });
}

async function calibreCoverBytes(cal: CalBook): Promise<Uint8Array | null> {
  const { out, code } = await sh(["ssh", SSH_HOST, `cat ${sq(`${LIB}/${cal.path}/cover.jpg`)}`]);
  return code === 0 && out.byteLength > 100 ? out : null;
}

async function token(): Promise<string> {
  if (process.env.INGEST_TOKEN) return process.env.INGEST_TOKEN.trim();
  const f = "/tmp/read_ingest_token.txt";
  if (existsSync(f)) return (await Bun.file(f).text()).trim();
  throw new Error("no INGEST_TOKEN (env or /tmp/read_ingest_token.txt)");
}

// ── run ─────────────────────────────────────────────────────────────────────
const [books, cal] = await Promise.all([koBooks(), calibreCatalog()]);
console.log(`KOReader books: ${books.length} · Calibre catalogue: ${cal.length}`);
const tok = target === "d1" && !dry ? await token() : "";

async function store(md5: string, bytes: Uint8Array): Promise<boolean> {
  if (target === "local") {
    await Bun.write(`${COVERS_DIR}/${md5}.jpg`, bytes);
    return true;
  }
  const res = await fetch(`${BASE}/cover/${md5}`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok}`, "content-type": "image/jpeg" },
    body: bytes,
  });
  if (!res.ok) console.log(`    (upload ${res.status} ${await res.text()})`);
  return res.ok;
}

let matched = 0;
let done = 0;
for (const ko of books) {
  const hit = matchCalibre(ko, cal);
  const t40 = ko.title.slice(0, 42).padEnd(42);
  let bytes: Uint8Array | null = null;
  let via = "";
  if (hit) {
    via = "calibre";
    if (!dry) bytes = await calibreCoverBytes(hit);
  } else if (web) {
    if (dry) via = skipWeb(ko.title) || !searchTitle(ko.title) ? "" : "web?";
    else {
      const w = await webCover(ko);
      if (w) ({ bytes, via } = w);
    }
  }
  if (!hit && !via) {
    console.log(`  ✗ ${t40} → —`);
    continue;
  }
  matched++;
  if (dry) {
    console.log(`  ✓ ${t40} → ${hit ? hit.title.slice(0, 36) : `(${via})`}`);
    continue;
  }
  if (!bytes) {
    console.log(`  ! ${t40} → ${via}  (no image)`);
    continue;
  }
  if (await store(ko.md5, bytes)) {
    done++;
    console.log(`  ✓ ${t40} → ${via}  (${(bytes.byteLength / 1024) | 0}kB)`);
  }
}
console.log(`\nmatched ${matched}/${books.length}${dry ? " (dry run)" : `, wrote ${done}`}`);
