import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Serve an embedded book cover stored as a BLOB in D1 (uploaded by the plugin via read-mcp).
export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, "cover store unavailable");
  if (!/^[a-f0-9]{6,64}$/i.test(params.md5)) throw error(400, "bad md5");
  const row = await db
    .prepare("SELECT content_type, bytes FROM covers WHERE md5 = ?")
    .bind(params.md5)
    .first<{ content_type: string; bytes: ArrayBuffer | number[] }>();
  if (!row) throw error(404, "no cover");
  // D1 returns a BLOB as an ArrayBuffer (older runtimes: number[]); normalize both.
  const buf = row.bytes instanceof ArrayBuffer ? row.bytes : new Uint8Array(row.bytes).buffer;
  setHeaders({
    "content-type": row.content_type || "image/jpeg",
    "cache-control": "public, max-age=86400, s-maxage=604800",
  });
  return new Response(buf as unknown as BodyInit);
};
