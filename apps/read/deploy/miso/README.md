# Deploy — WebDAV → miso (all static, no Cloudflare)

KOReader's built-in **Reading statistics → Cloud sync** uploads `statistics.sqlite3` to a
WebDAV folder on miso. A cron snapshots it and rebuilds a static `record.json` + cover
images; Caddy serves the React app + that JSON. No D1, no custom plugin required, no live
backend.

```
Kobo / KOReader  ──WebDAV(HTTPS)──▶  miso:/home/ubuntu/read/webdav/statistics.sqlite3
                                          │  cron: VACUUM INTO snapshot → build-record
                                          ▼
                          miso:/home/ubuntu/read/site/{index.html, record.json, covers/}
                                          │  Caddy file_server
                                          ▼
                              https://read.lolwierd.com   (the dashboard)
```

miso facts this is built around: **arm64 / Ubuntu 22.04**, Caddy (Cloudflare DNS-TLS),
Docker, `sqlite3` 3.37, no node/bun. The builder ships as a self-contained arm64 binary,
so nothing needs installing on miso.

## One-time setup

### 1. DNS (Cloudflare)
Add `read.lolwierd.com` and `dav.lolwierd.com` → miso (same as your other subdomains;
skip if you have a `*.lolwierd.com` record).

### 2. App + builder
```sh
bash apps/read/deploy/miso/deploy.sh      # builds, rsyncs site/, scps build-record, seeds record.json
```

### 3. WebDAV container (Docker)
```sh
scp apps/read/deploy/miso/webdav.yml miso:/home/ubuntu/read/webdav.yml
# edit the password in that file first!
ssh miso 'chmod 600 /home/ubuntu/read/webdav.yml'
ssh miso 'docker run -d --name kobo-webdav --restart unless-stopped \
  -p 127.0.0.1:6065:6065 \
  -v /home/ubuntu/read/webdav:/data \
  -v /home/ubuntu/read/webdav.yml:/config.yml:ro \
  hacdias/webdav@sha256:2b708c56b4f36cd75c56d29f22ca1b7bd364782ee15c184182a4187a03538fde -c /config.yml'
```

### 4. Caddy
Append `Caddyfile.snippet` to `/etc/caddy/Caddyfile`, then:
```sh
ssh miso 'sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak \
  && caddy validate --config /etc/caddy/Caddyfile \
  && sudo systemctl reload caddy'
```

### 5. Instant rebuild on sync (systemd path watcher) + cron backstop
A systemd `.path` unit watches the WebDAV stats DB and rebuilds the moment KOReader
uploads, so the site is fresh within seconds (the open page polls every 30s + on focus,
so it updates itself with no manual reload).

`refresh.sh` union-merges each uploaded candidate into a canonical snapshot by book MD5.
This keeps page history monotonic even when KOReader's deletion-aware cloud merge regresses
after a title or author edit. `snapshot.previous.sqlite3` is retained as a rollback copy.
```sh
scp apps/read/deploy/miso/read-refresh.{service,path} miso:/tmp/
ssh miso 'sudo cp /tmp/read-refresh.service /tmp/read-refresh.path /etc/systemd/system/ \
  && sudo systemctl daemon-reload && sudo systemctl enable --now read-refresh.path'
# backstop: also rebuild every 2h in case a write is missed
ssh miso '( crontab -l 2>/dev/null; echo "0 */2 * * * /home/ubuntu/read/refresh.sh >> /home/ubuntu/read/refresh.log 2>&1" ) | crontab -'
```

### 6. Kobo / KOReader
Enable the **Statistics** plugin (on by default). Then **☰ → Statistics → Settings →
Cloud sync** (or Reading-statistics sync) → **WebDAV**:
- Address: `https://dav.lolwierd.com`
- User / pass: from `webdav.yml`
- Sync now.

Optional: copy `plugin/read.koplugin/` to the Kobo only if you want a daily auto-trigger
of the built-in sync — not required for manual sync.

## Updating the app later
```sh
bash apps/read/deploy/miso/deploy.sh        # re-push app + binary, refresh record.json
```
Covers already pulled are kept; new books get covered on the next run (Calibre, then
AniList/Google Books fallback).
