# Limos Environments

Limos 只保留两套环境：开发和生产。

## Boundary

| Layer | Development | Production |
| --- | --- | --- |
| Purpose | 开发测试 | 真实用户 |
| Branch | `develop` | `main` |
| Domain | 本地或临时测试域名 | `limos.top`, `www.limos.top` |
| App host | Local Node server | 腾讯云北京轻量服务器 |
| Supabase project | Dev project | Prod project |
| State id | `limos-2026-dev` | `limos-2026` |
| Data | 测试数据 | 真实用户和奖池数据 |

硬规则：开发环境不能连接生产 Supabase，不能使用 `LIMOS_STATE_ID=limos-2026`。

## Local Development

```bash
cp .env.development.example .env.local
npm run dev
```

`.env.local` 应该使用 dev Supabase：

```text
LIMOS_ENV=development
LIMOS_STORAGE_MODE=api
LIMOS_STATE_ID=limos-2026-dev
LIMOS_SUPABASE_URL=https://YOUR_DEV_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_DEV_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_DEV_ADMIN_CODE
PORT=3000
HOST=127.0.0.1
```

## Production

生产只部署 `main` 分支内容。

服务器环境变量在 `/opt/limos/.env.production`：

```text
LIMOS_ENV=production
LIMOS_STORAGE_MODE=api
LIMOS_STATE_ID=limos-2026
LIMOS_SUPABASE_URL=https://YOUR_PROD_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_PROD_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_PROD_ADMIN_CODE
PORT=3000
HOST=127.0.0.1
```

生产启动由 systemd 管理：

```bash
systemctl status limos
systemctl status nginx
```

## Release Flow

1. 在 `develop` 开发。
2. 本地运行 `npm run check`。
3. 合并到 `main`。
4. 运行 `npm run deploy:prod`，把 `main` 打包并部署到腾讯云大陆服务器。
5. 验证 `https://limos.top/healthz` 和 `https://limos.top/api/diagnostics`。

推荐命令：

```bash
git checkout develop
npm run check
git push origin develop

git checkout main
git pull --ff-only origin main
git merge --no-ff develop -m "Promote develop to production"
git push origin main
npm run deploy:prod
```

部署命令见 [production-mainland.md](./production-mainland.md)。
