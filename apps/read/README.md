# @read/ledger — read

A minimalist, stats-heavy dashboard for your KOReader reading. Oat paper · ink · deep teal;
**Literata** (the KOReader reading font) / Schibsted Grotesk / Space Mono. Covers come from
your Calibre library on `miso`.

**Fully static.** KOReader's built-in *Reading statistics → Cloud sync* uploads
`statistics.sqlite3` to a WebDAV folder on miso; a cron rebuilds a static `record.json` +
cover images; Caddy serves the React app + that JSON. No Cloudflare, no D1, no live backend,
no custom plugin required.

## What it shows

In Hand (cover + progress + fortnight sparkline) · Today · The Tally · The Week with a
plain-language comparison · the full Year heatmap · The Hours radial clock · The Rhythm ·
The Shelf · a printable annual edition. Opening a book reveals its twelve-week calendar,
reading fingerprint, sitting distribution, recent momentum, metadata, and a deliberately
approximate finish range.

The page shows when its record was last received, polls for new syncs, and keeps a cached
copy for offline viewing. All numbers come from `@read/core` + `shared/stats.ts`, so dev and
the miso build compute identically. Reading intervals are divided across the dates and
hours they actually occupy.

## Architecture

```
Kobo / KOReader  ──WebDAV(HTTPS)──▶  miso:.../ledger/webdav/statistics.sqlite3
                                          │  cron: VACUUM INTO snapshot → build-record
                                          │        (+ Calibre / AniList / Google covers)
                                          ▼
                          miso:.../ledger/site/{index.html, record.json, covers/}
                                          │  Caddy file_server
                                          ▼
                              https://read.example.com
```

- `src/` — React + Vite SPA. Fetches `/record.dev.json` in dev, `/record.json` in prod.
- `shared/stats.ts` — `buildLedgerView()` = `@read/core` RecordView + ledger extras.
- `shared/from-stats.ts` — raw `statistics.sqlite3` rows → core Books/Sessions (the adapter).
- `shared/covers.ts` — Calibre match (ISBN→title) + AniList/Google Books web fallback.
- `book-overrides.json` — tiny MD5-keyed corrections for ambiguous KOReader rows.
- `scripts/build-record.ts` — **prod builder** (runs on miso): stats DB + Calibre → static
  `record.json`, yearly snapshots, first-finished history, metadata, and `covers/`. Compiles to a self-contained
  arm64 binary (`build:record`).
- `scripts/build-fixture-record.ts` — dev data from the local fixture.
- `scripts/sync-calibre-covers.ts` — dev: pull Calibre covers over ssh into `public/covers/`.
- `deploy/miso/` — the WebDAV container, Caddy snippet, cron job, and `deploy.sh` runbook.

## Develop

```sh
bun run scripts/build-fixture-record.ts          # regenerate public/record.dev.json
bun run scripts/sync-calibre-covers.ts --source fixture --target local --web   # covers
pnpm -C apps/read dev                          # http://localhost:5184
```

## Covers

Books match Calibre by ISBN, else normalized title (+ author check). `--web` adds a fallback
for anything Calibre lacks (manga & co.): **AniList** (manga) → **Google Books**. In prod
this all happens inside `build-record` on miso (local Calibre, no ssh).

## Deploy

See **`deploy/miso/README.md`** — one script (`deploy/miso/deploy.sh`) pushes the app +
arm64 builder to miso; a short one-time setup adds the WebDAV container, two Caddy blocks,
and the cron. Then point KOReader's stats Cloud-sync at your WebDAV URL, for example
`https://dav.example.com`.

## Scope

The active dashboard intentionally ignores `.sdr` sidecars and highlights. The old
Cloudflare applications remain reference code; the root test, typecheck, and build commands
cover the static dashboard and shared core used in production.
