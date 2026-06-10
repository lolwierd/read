#!/usr/bin/env bash
# Build the static app + the arm64 builder binary on the Mac and push them to miso.
# Run from anywhere: `bash apps/read/deploy/miso/deploy.sh`
set -euo pipefail

HOST="${MISO_HOST:-miso}"
REMOTE="/home/ubuntu/read"
cd "$(dirname "$0")/../.."   # → apps/read

pnpm run build          # vite → dist/
pnpm run build:record   # bun --compile → dist-tools/build-record (bun-linux-arm64)

ssh "$HOST" "mkdir -p $REMOTE/site $REMOTE/webdav"
# Update the app but keep the cron-generated record.json + covers/ in place.
rsync -a --delete --exclude record.json --exclude covers/ dist/ "$HOST:$REMOTE/site/"
# atomically swap the binary (scp-in-place races with a watcher/cron run → "Text file busy")
scp dist-tools/build-record "$HOST:$REMOTE/build-record.new"
scp deploy/miso/refresh.sh  "$HOST:$REMOTE/refresh.sh"
ssh "$HOST" "chmod +x $REMOTE/build-record.new $REMOTE/refresh.sh && mv -f $REMOTE/build-record.new $REMOTE/build-record && $REMOTE/refresh.sh"

echo "✓ app + builder deployed; record.json refreshed."
echo "  one-time infra (see deploy/miso/README.md): webdav container · Caddy blocks · cron · DNS · Kobo plugin"
