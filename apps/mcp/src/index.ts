// read-mcp worker entrypoint.
// OAuthProvider guards /mcp with a bearer token; the default Hono handler runs a Google
// login restricted to a single allowlisted email, and also serves /ingest — the Kobo
// push endpoint, gated by a shared INGEST_TOKEN (no interactive OAuth on the device).

import { OAuthProvider, type AuthRequest, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { ingestPayload } from "@read/core";
import { handleMcp } from "./mcp.js";
import { upsertIngest } from "./db.js";

export interface Bindings {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_EMAIL: string;
  INGEST_TOKEN: string;
}

const WEB_ORIGIN = "https://read.example.com";
const isHexMd5 = (s: string): boolean => /^[a-f0-9]{6,64}$/i.test(s);

interface UserProps {
  email: string;
  name: string;
  sub: string;
}

// ── API handler: only reached with a valid OAuth token; props carry the authed user. ──
const apiHandler = {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: UserProps }).props;
    if (!props || props.email !== env.ALLOWED_EMAIL) return new Response("Forbidden", { status: 403 });
    return handleMcp(request, { db: env.DB, now: () => new Date() });
  },
};

// ── Default handler: Google OAuth login + /ingest. ──
const app = new Hono<{ Bindings: Bindings }>();

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

const b64urlEncode = (s: string): string => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s: string): string => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

/** Length-independent constant-time string compare (avoids a timing oracle on the token). */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
  return diff === 0;
}

app.get("/", (c) => c.text("read-mcp — reading record ingest + MCP. /ingest (token) · /mcp (OAuth).", 200));

// Shared Bearer-token gate for the Kobo push endpoints (not OAuth).
function ingestAuthed(req: { header: (k: string) => string | undefined }, env: Bindings): boolean {
  const token = (req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!env.INGEST_TOKEN && timingSafeEqual(token, env.INGEST_TOKEN);
}

// Kobo push endpoint — Bearer INGEST_TOKEN, not OAuth.
app.post("/ingest", async (c) => {
  if (!ingestAuthed(c.req, c.env)) return c.json({ error: "unauthorized" }, 401);
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const parsed = ingestPayload.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return c.json({ error: "invalid payload", detail }, 400);
  }
  const counts = await upsertIngest(c.env.DB, parsed.data);
  return c.json({ ok: true, ...counts }, 200);
});

// Which book covers we already have — so the plugin only uploads the missing ones.
app.get("/covers", async (c) => {
  if (!ingestAuthed(c.req, c.env)) return c.json({ error: "unauthorized" }, 401);
  const r = await c.env.DB.prepare("SELECT md5 FROM covers").all<{ md5: string }>();
  return c.json({ have: r.results.map((x) => x.md5) });
});

// Embedded cover upload (raw image bytes) → stored as a BLOB in D1, keyed by md5; points
// the book's cover_url at the web worker's /cover/:md5 route. D1, not R2.
app.post("/cover/:md5", async (c) => {
  if (!ingestAuthed(c.req, c.env)) return c.json({ error: "unauthorized" }, 401);
  const md5 = c.req.param("md5");
  if (!isHexMd5(md5)) return c.json({ error: "bad md5" }, 400);
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "empty body" }, 400);
  if (body.byteLength > 1_500_000) return c.json({ error: "too large" }, 413); // keep under D1 row limit
  const contentType = c.req.header("Content-Type") || "image/jpeg";
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO covers (md5, content_type, bytes, updated_at)
       VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(md5) DO UPDATE SET content_type=?2, bytes=?3, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    ).bind(md5, contentType, body),
    c.env.DB.prepare(
      "UPDATE books SET cover_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE md5 = ?",
    ).bind(`${WEB_ORIGIN}/cover/${md5}`, md5),
  ]);
  return c.json({ ok: true, bytes: body.byteLength });
});

app.get("/authorize", async (c) => {
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const redirectUri = new URL("/callback", c.req.url).toString();
  const state = b64urlEncode(JSON.stringify(oauthReq));
  const g = new URL(GOOGLE_AUTH);
  g.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  g.searchParams.set("redirect_uri", redirectUri);
  g.searchParams.set("response_type", "code");
  g.searchParams.set("scope", "openid email profile");
  g.searchParams.set("state", state);
  g.searchParams.set("prompt", "select_account");
  g.searchParams.set("access_type", "online");
  return c.redirect(g.toString(), 302);
});

app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Missing code/state", 400);

  let oauthReq: AuthRequest;
  try {
    oauthReq = JSON.parse(b64urlDecode(state)) as AuthRequest;
  } catch {
    return c.text("Bad state", 400);
  }

  const redirectUri = new URL("/callback", c.req.url).toString();
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Google token exchange failed", 502);
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) return c.text("No access token from Google", 502);

  const infoRes = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!infoRes.ok) return c.text("Google userinfo failed", 502);
  const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };

  if (!info.email || info.email_verified !== true) return c.text("Email not verified", 403);
  if (info.email !== c.env.ALLOWED_EMAIL) return c.text("This MCP server is restricted to its owner.", 403);

  const props: UserProps = { email: info.email, name: info.name ?? info.email, sub: info.sub ?? info.email };
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: props.sub,
    scope: oauthReq.scope,
    metadata: { email: props.email },
    props,
  });
  return c.redirect(redirectTo, 302);
});

export default new OAuthProvider<Bindings>({
  apiRoute: ["/mcp", "/mcp/"],
  apiHandler,
  defaultHandler: app,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
