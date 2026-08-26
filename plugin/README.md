# KOReader Plugins

The ledger now uses KOReader's built-in **Reading statistics -> Cloud sync** over WebDAV.
That means the v1 Kobo plugin should be tiny: it only triggers KOReader's official
statistics sync action once per day when Wi-Fi is connected.

## Use This For WebDAV

Install:

- `readstatsautosync.koplugin/`

What it does:

- listens for KOReader resume, reader-ready, and network-connected events
- checks that KOReader Reading Statistics Cloud sync is configured
- triggers KOReader's built-in `SyncBookStats` event at most once per 24 hours
- clears KOReader's last-sync cache before merging, making reading history append-only;
  changing a title or author can no longer be misread as deletion of the old book
- stores its timer in KOReader settings as `readstatsautosync.lua`

What it does not do:

- it does not parse `statistics.sqlite3`
- it does not POST JSON to the dashboard
- it does not sync highlights or sidecars
- it does not wake the Kobo or turn Wi-Fi on by itself

KOReader's stock sync identifies books by `(title, authors, md5)`, so metadata edits can
erase history during its deletion-aware three-way merge. Prefer the helper's **Sync now**:

`Tools -> Reading statistics -> Synchronize now`

The helper plugin also adds:

`Tools -> Reading statistics auto-sync`

with:

- `Enabled`
- `Sync now`
- `Reset daily timer`

## Install Auto-Sync Helper

1. Connect the Kobo over USB.
2. Copy `readstatsautosync.koplugin/` to:
   `.adds/koreader/plugins/readstatsautosync.koplugin/`
3. Eject the Kobo.
4. Restart KOReader.
5. In KOReader, configure WebDAV first:
   `Tools -> Reading statistics -> Settings -> Cloud sync`
6. Use `Tools -> Reading statistics auto-sync -> Sync now` once to test.

## Old JSON Push Plugin

`read.koplugin/` is the older full JSON push plugin.

It is superseded for v1 by WebDAV raw SQLite sync, but is kept around as a possible future
base for sidecars/highlights.

Pushes your reading data to your ledger server (`https://your-ledger.example/ingest`) from the Kobo. It
reads KOReader's own `statistics.sqlite3` (totals + sessions) and each book's `.sdr`
sidecar (progress, doc_props, highlights + notes), merges them by KOReader's partial-md5,
and POSTs one JSON payload to `<server>/ingest` with a bearer token. Re-sending is always
safe (server upserts by md5, dedupes sessions/annotations).

## Install

1. Connect the Kobo over USB.
2. Copy the whole `read.koplugin/` folder into the device's KOReader plugins dir:
   `.adds/koreader/plugins/read.koplugin/`  (on a Kobo, KOReader lives under `.adds`).
3. Eject, reopen KOReader.
4. **☰ menu → Tools → Reading Record sync**:
   - **Set server URL** → your ledger server URL, for example `https://read.example.com`
   - **Set token** → the `INGEST_TOKEN` (same value set as the ledger Worker secret)
   - optionally enable **Auto-sync on Wi-Fi connect**
5. **Sync now**. You should see `Synced: N books · N sessions · N highlights`.

## Notes

- Enable KOReader's **Statistics** plugin (it's on by default) so sessions/streak/heatmap
  have data; highlights work regardless.
- It only walks books in your **reading history**, which is what we want to track.
- Logs: KOReader's `crash.log` (search `readsync:`) for any failure detail.

## Debugging a failed sync

`Sync failed (code)` → check the code:
- `401` — token mismatch (plugin token ≠ Worker `INGEST_TOKEN`).
- `400` — payload rejected by the Zod schema; the response body names the field.
- network error — make sure Wi-Fi actually connected.
