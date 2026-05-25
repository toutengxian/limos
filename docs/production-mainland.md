# Mainland Production Runbook

这是当前唯一生产方案。

## Host

- Domain: `limos.top`, `www.limos.top`
- Server: 腾讯云北京轻量服务器
- Public IP: `81.70.48.181`
- App dir: `/opt/limos`
- Node service: `limos.service`
- Reverse proxy: `nginx.service`
- Backup timer: `limos-backup.timer`

## DNS

DNSPod records:

```text
@    A    81.70.48.181
www  A    81.70.48.181
```

## Firewall

腾讯云防火墙需要放行 IPv4：

```text
TCP 22   SSH
TCP 80   HTTP -> HTTPS redirect
TCP 443  HTTPS
ICMP     Ping
```

## SSH

Codex uses a dedicated deploy key:

```bash
ssh -i ~/.ssh/limos_deploy_ed25519 root@81.70.48.181
```

## Deploy

From local machine, after `main` is ready:

```bash
git checkout main
git pull --ff-only origin main
npm run deploy:prod
```

The script:

- requires branch `main`
- requires a clean working tree
- runs `npm run check`
- creates a git archive from `main`
- uploads it with `scp`
- builds a new release under `/opt/limos.releases`
- preserves `/opt/limos/.env.production`
- switches `/opt/limos` to the new release
- restarts `limos.service`
- reloads `nginx.service`
- verifies local and public health checks

Emergency flags:

```bash
npm run deploy:prod -- --skip-check
npm run deploy:prod -- --allow-dirty
npm run deploy:prod -- --allow-non-main
```

## Verify

```bash
curl -fsS https://limos.top/healthz
curl -fsS https://limos.top/api/diagnostics
systemctl status limos --no-pager
systemctl status nginx --no-pager
```

Expected:

```text
{"ok":true}
```

`/api/diagnostics` should report `ok: true`, `stateId: limos-2026`, and successful Supabase reads.

## HTTPS

Certificate:

```bash
certbot certificates
```

Renewal is managed by Certbot's system timer.

## Backups

Production backups call the local API from the server:

```bash
curl -fsS http://127.0.0.1:3000/api/backup
```

Backups are written to Supabase table `limos_state_backups`.

The server runs this through systemd:

```bash
systemctl status limos-backup.timer --no-pager
systemctl list-timers --all --no-pager | grep limos-backup
```

Current schedule: daily around `03:30` server time.

## Rollback

List releases:

```bash
ls -lt /opt/limos.releases
readlink -f /opt/limos
```

Restore one:

```bash
systemctl stop limos
ln -sfn /opt/limos.releases/YYYYMMDDHHMMSS-SHA /opt/limos
systemctl start limos
```

Then verify:

```bash
curl -fsS https://limos.top/healthz
curl -fsS https://limos.top/api/diagnostics
```
