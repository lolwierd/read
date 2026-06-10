# Read

A personal reading dashboard for Kobo and KOReader data.

The active deployment path is intentionally simple: KOReader syncs `statistics.sqlite3`
to a private WebDAV folder, a small Bun-built record builder snapshots that database,
and a static React app serves the resulting `record.json` and covers.

## What is included

- `apps/read` - the static reading dashboard and the WebDAV stats builder.
- `packages/core` - shared KOReader normalization, time helpers, rollups, and schemas.
- `plugin` - KOReader plugins for pushing or syncing reading data.
- `apps/mcp` and `apps/web` - earlier Cloudflare/D1 paths retained as reference code.
- `migrations` - the D1 schema used by the Cloudflare version.

Generated records, covers, real device fixtures, and local build outputs are ignored so
the repository can stay public without publishing private reading data.

## Current stats filtering

The static dashboard drops accidental opens and internal KOReader rows before building
metrics. A book is shown when any of these are true:

- at least 5 minutes of read time,
- at least 5 percent progress when page count is known,
- at least 20 read pages when page count is unknown,
- at least 20 session rows.

Known non-book rows such as the KOReader quickstart guide, MyScript/font entries, and
generic chapter cache rows are always dropped.

## Development

Install dependencies:

```sh
pnpm install
```

Run the read dashboard:

```sh
pnpm --filter @read/read dev
```

Run checks:

```sh
pnpm --filter @read/read test
pnpm --filter @read/read typecheck
pnpm --filter @read/read build
pnpm --filter @read/core test
```

Build the production record builder:

```sh
pnpm --filter @read/read build:record
```

## Deployment Shape

The WebDAV deployment lives under `apps/read/deploy/miso`. It assumes:

- a server that receives KOReader's `statistics.sqlite3` through WebDAV,
- a local Calibre library on that server for cover matching,
- Caddy or another static file server for the built dashboard,
- the compiled `build-record` binary refreshed after each stats sync.

Use the deployment files as templates and replace hostnames, paths, and passwords for
your own setup before running anything on a public server.
