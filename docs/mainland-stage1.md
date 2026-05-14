# Mainland Access Stage 1

目标：先绕开国内到 Vercel 的不稳定链路，把 Limos 前端和 `/api/state` 放到腾讯云香港轻量/CVM。Supabase 暂时保留，只由服务器端访问，浏览器仍然只访问本站域名。

这一步不改生产数据结构，也不影响当前 Vercel 生产站。验证通过后再把 `limos.best` 的 DNS 切到新主机。

## 架构

```text
用户浏览器
  -> limos.best
  -> 腾讯云香港 Node 服务
  -> /api/state 服务器端访问 Supabase
```

阶段 1 解决的是「国内用户访问 Vercel 慢或失败」。如果 Supabase 服务器端访问也不稳定，阶段 2 再把数据库和头像迁到腾讯云体系。

## 服务器准备

建议先用腾讯云轻量应用服务器香港区，Ubuntu 22.04 或 Node.js 镜像均可。没有 ICP 的情况下，先不要选中国大陆地域。

服务器需要：

- Node.js 20+
- Git
- Nginx
- 一个指向服务器公网 IP 的测试域名，例如 `hk.limos.best`

## 部署代码

```bash
git clone https://github.com/toutengxian/limos.git /opt/limos
cd /opt/limos
git checkout develop
npm ci
```

阶段 1 灰度先使用 `develop`。确认 `hk.limos.best` 稳定后，再把代码合并到 `main` 并切正式域名。

创建 `/opt/limos/.env.production`：

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

本地启动验证：

```bash
LIMOS_ENV_FILE=.env.production npm start
```

验证接口：

```bash
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/api/state
```

## systemd 服务

创建 `/etc/systemd/system/limos.service`：

```ini
[Unit]
Description=Limos Node Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/limos
Environment=LIMOS_ENV_FILE=/opt/limos/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

启动：

```bash
systemctl daemon-reload
systemctl enable --now limos
systemctl status limos
```

## Nginx 反向代理

先把测试域名 `hk.limos.best` 解析到服务器公网 IP。

创建 `/etc/nginx/sites-available/limos`：

```nginx
server {
  listen 80;
  server_name hk.limos.best;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

启用：

```bash
ln -s /etc/nginx/sites-available/limos /etc/nginx/sites-enabled/limos
nginx -t
systemctl reload nginx
```

需要 HTTPS 时，用腾讯云 SSL 证书或 `certbot` 给 `hk.limos.best` 签证书。

## 灰度验证

1. 先访问 `https://hk.limos.best/healthz`，确认返回 `{"ok":true}`。
2. 再访问 `https://hk.limos.best`，确认登录、看板、曲线、账本都能读取真实数据。
3. 找 2-3 个不翻墙用户测试首屏、登录、上秤、刷新速度。
4. 测试稳定后，把 `limos.best` 的 A 记录从 Vercel 切到腾讯云服务器公网 IP。
5. 保留 Vercel 配置 24-48 小时，方便 DNS 回滚。

## 回滚

如果新线路异常，把 `limos.best` 的 DNS 改回 Vercel 当前记录即可。阶段 1 仍然使用同一个 Supabase 生产状态，所以回滚不会丢数据。

## 判断是否进入阶段 2

如果国内用户访问新主机稳定，但记录体重偶尔慢，瓶颈可能在服务器到 Supabase 的跨境请求。那时再做阶段 2：

- 头像从 JSON 状态迁到腾讯云 COS
- 状态表从 Supabase 迁到腾讯云数据库或 CloudBase
- `/api/state` 改为腾讯云内网访问数据库
