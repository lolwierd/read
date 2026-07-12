#!/usr/bin/env bash
# Cron job on miso: snapshot the WebDAV-synced KOReader stats DB and rebuild the static
# dashboard (record.json + covers). Safe to run when no sync has happened yet — the builder
# then writes an empty record.json (fresh-install state).
set -euo pipefail

LEDGER="/home/ubuntu/read"
DB_SRC="$LEDGER/webdav/statistics.sqlite3"
SNAP="$LEDGER/snapshot.sqlite3"
CANDIDATE="$LEDGER/incoming.sqlite3"
CALIBRE="/home/ubuntu/media/books/calibre-library"

# The path watcher and the cron backstop can arrive together. Keep one builder in flight.
exec 9>"$LEDGER/refresh.lock"
flock -n 9 || exit 0
printf '[%s] refreshing read\n' "$(date --iso-8601=seconds)"

if [ -f "$DB_SRC" ]; then
  # Clean candidate that folds in the WAL — never read the file KOReader may be
  # mid-writing. The canonical snapshot is append-only because KOReader's stock cloud
  # merge can mistake author/title edits for deletion of an entire book history.
  rm -f "$CANDIDATE"
  sqlite3 "file:$DB_SRC?mode=ro" "VACUUM INTO '$CANDIDATE'"
  if [ ! -f "$SNAP" ]; then
    mv -f "$CANDIDATE" "$SNAP"
  else
    cp -p "$SNAP" "$LEDGER/snapshot.previous.sqlite3"
    before="$(sqlite3 "$SNAP" 'SELECT count(*) FROM page_stat_data')"
    incoming="$(sqlite3 "$CANDIDATE" 'SELECT count(*) FROM page_stat_data')"
    sqlite3 "$SNAP" <<SQL
ATTACH '$CANDIDATE' AS incoming;

-- Add a representative row for genuinely new content. Mutable title/author metadata is
-- deliberately excluded from identity; KOReader content MD5 is the stable key.
INSERT INTO book(title,authors,notes,last_open,highlights,pages,series,language,md5,total_read_time,total_read_pages)
SELECT i.title,i.authors,i.notes,i.last_open,i.highlights,i.pages,i.series,i.language,i.md5,i.total_read_time,i.total_read_pages
FROM incoming.book i
WHERE i.md5 NOT IN (SELECT md5 FROM book)
  AND i.id=(SELECT i2.id FROM incoming.book i2 WHERE i2.md5=i.md5
            ORDER BY coalesce(i2.total_read_time,0) DESC,coalesce(i2.total_read_pages,0) DESC,i2.id LIMIT 1);

-- Keep book totals monotonic while still accepting newer metadata-neutral activity.
UPDATE book SET
  last_open=max(coalesce(last_open,0),coalesce((SELECT max(i.last_open) FROM incoming.book i WHERE i.md5=book.md5),0)),
  pages=max(coalesce(pages,0),coalesce((SELECT max(i.pages) FROM incoming.book i WHERE i.md5=book.md5),0)),
  total_read_time=max(coalesce(total_read_time,0),coalesce((SELECT max(i.total_read_time) FROM incoming.book i WHERE i.md5=book.md5),0)),
  total_read_pages=max(coalesce(total_read_pages,0),coalesce((SELECT max(i.total_read_pages) FROM incoming.book i WHERE i.md5=book.md5),0));

-- Re-key incoming sessions through MD5 because numeric book IDs differ between copies.
INSERT OR IGNORE INTO page_stat_data(id_book,page,start_time,duration,total_pages)
SELECT target.id,p.page,p.start_time,p.duration,p.total_pages
FROM incoming.page_stat_data p
JOIN incoming.book source ON source.id=p.id_book
JOIN book target ON target.id=(SELECT min(b.id) FROM book b WHERE b.md5=source.md5);

DETACH incoming;
SQL
    after="$(sqlite3 "$SNAP" 'SELECT count(*) FROM page_stat_data')"
    rm -f "$CANDIDATE"
    printf 'canonical merge: previous=%s incoming=%s merged=%s rows\n' "$before" "$incoming" "$after"
  fi
fi

"$LEDGER/build-record" --db "$SNAP" --calibre "$CALIBRE" --out "$LEDGER/site"
