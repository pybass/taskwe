# Deployment

One Linux host runs one binary against one SQLite file, with Caddy in front for HTTPS. The binary bundles the server
and the web app, so the host needs no Bun, no Node, and no build step. Everything of the app lives in `/apps/taskwe/`.
The service runs as the system user `taskwe`, which owns `/apps/taskwe/data/` and can write nowhere else. The host
may serve other apps under `/apps/` on the same Caddy.

There is no CI yet: the binary is built on a dev machine and copied to the host by `scripts/deploy.ts`.

## Prepare the host

A Debian or Ubuntu host with a DNS name pointing at it, reached as root over SSH.

The app listens on `127.0.0.1` by default, so its port is not reachable from outside; Caddy on the same host is its one
client. The firewall should still allow only 22, 80, and 443. The deploy script does not touch the firewall.

The DNS name must resolve to the host before the first deploy. The reload succeeds either way, but Caddy gets the
certificate in the background and the site answers with TLS errors until the name resolves; failed attempts count
toward the CA's rate limits.

## Deploy

On the dev machine, from the repo root:

```sh
just deploy root@tasks.example.com                    # bun-linux-x64
just deploy root@tasks.example.com bun-linux-arm64
```

The target must match the host CPU: `uname -m` on the host says `x86_64` for `bun-linux-x64` and `aarch64` for
`bun-linux-arm64`. The script asks for the site's domain and the app's port only on a fresh host; an update keeps
the current ones. Pick a port no other app on the host uses; the default is 3000. Then it:

1. Compiles the server and the web app into one file of about 80 MB, `dist/taskwe` (`just build`).
2. Installs Caddy when the host has none, and creates `/apps/taskwe`. Updating Caddy is the host owner's job, like
   the firewall.
3. Creates the system user `taskwe`, no shell, no home. `chown -R` on `/apps/taskwe/data` runs on every deploy, so
   files root copied in become the service's too.
4. Writes the global `/etc/caddy/Caddyfile` when it is missing or still the package default, asking for the
   certificate authority's email (optional). A file edited by hand that does not import `/apps/*/Caddyfile` stops
   the deploy: add the line and run it again.
5. Writes `/etc/systemd/system/taskwe.service` and the vhost `/apps/taskwe/Caddyfile`, enables the service, reloads
   Caddy.
6. Uploads the binary as `taskwe.new`, swaps it in, restarts the service, and fails when it is not active a second later.

Every host step is a no-op when already done, so the same command serves the first deploy and an update. Caddy
obtains and renews the certificate itself.

### Caddy layout

`/etc/caddy/Caddyfile` holds only the global options and one import; each app under `/apps/` owns its vhost file in
its own directory. A second app on the host is a new directory, not an edit to the global file. The script replaces
only a missing global file or the untouched package default (`dpkg -V caddy` tells them apart); a host provisioned
by other means keeps its options and adds the import line by hand.

```caddyfile
{
	email ops@example.com
}

import /apps/*/Caddyfile
```

The vhost the script writes to `/apps/taskwe/Caddyfile`:

```caddyfile
tasks.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

Trap: `systemctl reload caddy` fails on an invalid config and keeps the running one, so a broken vhost of any app
blocks the reload for all of them.

The service unit:

```ini
[Unit]
Description=taskwe
After=network.target

[Service]
User=taskwe
WorkingDirectory=/apps/taskwe
Environment=DATA_PATH=/apps/taskwe/data
Environment=PORT=3000
Environment=SITE_URL=https://tasks.example.com
ExecStart=/apps/taskwe/taskwe
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/apps/taskwe/data
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

Trap: under the unit the service can write only to `/apps/taskwe/data`; a write anywhere else fails with `EROFS` and
works in `just dev`. Put the file under `DATA_PATH` or add the path to `ReadWritePaths`.

`DATA_PATH`, `HOST`, `PORT`, and `SITE_URL` are the only settings. `DATA_PATH` is the folder of the app's files, created
when missing: `taskwe.db` and `backups/`. `HOST` is the address to listen on; the unit leaves it at its default,
`127.0.0.1`, and a container sets `0.0.0.0`. `PORT` is the one given at the first deploy. `SITE_URL` is the site's address,
which every push to a phone names as the sender's contact, as Web Push requires; when it starts with `https:`, the
session cookie gets the `Secure` flag, since the app itself sees only Caddy's plain HTTP. The first start creates the
database with the user `admin`, password `admin`.

```sh
journalctl -u taskwe -f    # expect "Listening on http://127.0.0.1:<port>"
```

Open the site, log in as `admin`, and change the password at `/password`.

## Logs

The app writes no log file: it prints to stdout and stderr, and systemd keeps them in the journal. An unexpected
error in a request is logged with its method and path and answered 500; a failed push is logged too. A 4xx is not
logged.

```sh
journalctl -u taskwe -p err -S yesterday    # errors since yesterday
journalctl -u taskwe -S "1 hour ago"        # everything of the last hour
```

Trap: the journal survives a reboot only when `/var/log/journal` exists; `journalctl --disk-usage` says which. Debian
and Ubuntu create it, a minimal image may not: `mkdir /var/log/journal && systemctl restart systemd-journald`.

## Backup and restore

An admin makes a backup at `/admin/backups`: a consistent copy of `taskwe.db` in `/apps/taskwe/data/backups/`, named by
its UTC time. Keep copies off the host too: download one from the page, or
`scp host:/apps/taskwe/data/backups/taskwe-2026-09-12T10-30-00Z.db .`.

The same page says whether the live database matches the schema of the running build, and lists every table, index,
trigger, or constraint that differs, after a migration or an edit by hand on the host. Each backup in the list gets the
same check, so a file of another version or an edited one shows as different before a restore.

A restore is on the same page, from the list: the app backs up the current database, swaps the file in, and keeps
running. Every session ends with it: log in again with the passwords of that time. A copy kept off the host goes back
through the upload form on the page, which adds it to the list and shows its spaces and last event time, so it can be
checked before the restore.

When the app cannot start, restore by hand while the service is down. The running process holds the file open and
caches users and spaces in memory, so a copy under a live service is not seen and may be overwritten. The `chown` is
for a database that was missing: `cp` onto an existing file keeps its owner.

```sh
ssh host 'systemctl stop taskwe && cp /apps/taskwe/data/backups/taskwe-2026-09-12T10-30-00Z.db /apps/taskwe/data/taskwe.db && chown taskwe:taskwe /apps/taskwe/data/taskwe.db && systemctl start taskwe'
```

Trap: a backup has the schema of the binary that made it. The page refuses any other version; by hand nothing does.
After a schema change, restore a backup only with the binary that made it.

## Update

The same `just deploy` command. It uploads the binary under a new name, then swaps it with a rename and restarts. The
rename is atomic, and the running process keeps the old file open, so the upload never fails with "text file busy".

```sh
scp dist/taskwe host:/apps/taskwe/taskwe.new
ssh host 'cd /apps/taskwe && mv taskwe taskwe.prev && mv taskwe.new taskwe && systemctl restart taskwe'
```

Rollback is the reverse: move `taskwe.prev` back and restart.

Migrations run at start, so a restart is also the migration. The app backs up the database first, into `backups/` as
`taskwe-2026-09-12T10-30-00Z-before-v3.db`. Trap: a rollback to `taskwe.prev` needs that file restored by hand, as
above.
