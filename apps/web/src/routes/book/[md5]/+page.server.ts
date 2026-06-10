import { error } from "@sveltejs/kit";
import { loadBook } from "$lib/server/record";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
  setHeaders({ "cache-control": "public, max-age=0, must-revalidate, s-maxage=30, stale-while-revalidate=120" });
  const db = platform?.env?.DB;
  if (!db) throw error(503, "Database unavailable");
  const page = await loadBook(db, params.md5);
  if (page === null) throw error(404, "Book not found");
  return { page };
};
