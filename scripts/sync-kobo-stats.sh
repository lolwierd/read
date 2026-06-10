#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KOBO_MOUNT=${KOBO_MOUNT:-/Volumes/KOBOeReader}
SRC_DIR="$KOBO_MOUNT/.adds/koreader/settings"
SRC_DB="$SRC_DIR/statistics.sqlite3"
DEST_DIR="$ROOT/fixtures/real"
TMP_DIR="$DEST_DIR/.sync-tmp"
BUILD_LEDGER=0

usage() {
  printf 'usage: %s [--build-ledger]\n' "$0"
  printf '\n'
  printf 'Copies KOReader statistics.sqlite3 from a mounted Kobo into fixtures/real/.\n'
  printf 'Set KOBO_MOUNT=/path/to/mount if the Kobo is mounted somewhere else.\n'
}

for arg in "$@"; do
  case "$arg" in
    --build-ledger) BUILD_LEDGER=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

if [ ! -f "$SRC_DB" ]; then
  printf 'KOReader statistics DB not found: %s\n' "$SRC_DB" >&2
  printf 'Connect the Kobo over USB and choose its storage/connect option.\n' >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

cp -p "$SRC_DB" "$TMP_DIR/statistics.sqlite3"
if [ -f "$SRC_DB-wal" ]; then
  cp -p "$SRC_DB-wal" "$TMP_DIR/statistics.sqlite3-wal"
fi
if [ -f "$SRC_DB-shm" ]; then
  cp -p "$SRC_DB-shm" "$TMP_DIR/statistics.sqlite3-shm"
fi

sqlite3 "file:$TMP_DIR/statistics.sqlite3?mode=ro" "pragma integrity_check;" | grep -qx ok

mv "$TMP_DIR/statistics.sqlite3" "$DEST_DIR/statistics.sqlite3"
if [ -f "$TMP_DIR/statistics.sqlite3-wal" ]; then
  mv "$TMP_DIR/statistics.sqlite3-wal" "$DEST_DIR/statistics.sqlite3-wal"
else
  rm -f "$DEST_DIR/statistics.sqlite3-wal"
fi
if [ -f "$TMP_DIR/statistics.sqlite3-shm" ]; then
  mv "$TMP_DIR/statistics.sqlite3-shm" "$DEST_DIR/statistics.sqlite3-shm"
else
  rm -f "$DEST_DIR/statistics.sqlite3-shm"
fi
rm -rf "$TMP_DIR"

sqlite3 -readonly "$DEST_DIR/statistics.sqlite3" \
  "select 'synced books=' || count(*) from book; select 'synced sessions=' || count(*) from page_stat_data;"

if [ "$BUILD_LEDGER" -eq 1 ]; then
  (cd "$ROOT" && pnpm -C apps/ledger fixture)
fi
