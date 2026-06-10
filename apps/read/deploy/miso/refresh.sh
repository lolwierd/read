#!/usr/bin/env bash
# Cron job on miso: snapshot the WebDAV-synced KOReader stats DB and rebuild the static
# dashboard (record.json + covers). Safe to run when no sync has happened yet — the builder
# then writes an empty record.json (fresh-install state).
set -euo pipefail

LEDGER="/home/ubuntu/read"
DB_SRC="$LEDGER/webdav/statistics.sqlite3"
SNAP="$LEDGER/snapshot.sqlite3"
CALIBRE="/home/ubuntu/media/books/calibre-library"

if [ -f "$DB_SRC" ]; then
  # Clean snapshot that folds in the WAL — never read the file KOReader may be mid-writing.
  rm -f "$SNAP.tmp"
  sqlite3 "$DB_SRC" "VACUUM INTO '$SNAP.tmp'"
  mv -f "$SNAP.tmp" "$SNAP"
fi

"$LEDGER/build-record" --db "$SNAP" --calibre "$CALIBRE" --out "$LEDGER/site"
