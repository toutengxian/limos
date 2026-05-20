# Mainland Access Stage 1

目标：先绕开国内到 Vercel 的不稳定链路，把 Limos 前端和同源 `/api/*` 放到腾讯云香港轻量/CVM。Supabase 暂时保留，只由服务器端访问，浏览器仍然只访问本站域名。

这一步不改生产数据结构。当前 `hk.limos.best` 已经承载真实用户访问，所以按生产入口管理，默认部署 `main` 分支并连接生产 Supabase。

## 架构

```text
用户浏览器
  -> hk.limos.best
  -> 腾讯云香港 Node 服务
  -> /api/* 服务器端访问 Supabase
```

阶段 1 解决的是「国内用户访问 Vercel 慢或失败」。如果 Supabase 服务器端访问也不稳定，阶段 2 再把数据库和头像迁到腾讯云体系。

## 服务器准备

建议先用腾讯云轻量应用服务器香港区，Ubuntu 22.04 或 Node.js 镜像均可。没有 ICP 的情况下，先不要选中国大陆地域。

服务器需要：

- Node.js 20+
- Git
- Nginx
- 一个指向服务器公网 IP 的测试域名，例如 `hk.limos.best`

服务器创建好之后，先在 DNS 里加一条测试域名：

```text
hk.limos.best -> A -> 腾讯云服务器公网 IP
```

腾讯云防火墙需要放行 IPv4：

- TCP 22，来源 `0.0.0.0/0`：SSH
- TCP 80，来源 `0.0.0.0/0`：HTTP 灰度验证
- TCP 443，来源 `0.0.0.0/0`：HTTPS

如果控制台里显示“全部 IPv6 地址”，那只对 IPv6 生效。`hk.limos.best` 当前使用 IPv4 A 记录时，必须另外添加“全部 IPv4 地址”或 `0.0.0.0/0` 的 443 规则。

## 部署代码

推荐直接用安装脚本：

```bash
apt-get update
apt-get install -y git
git clone https://github.com/toutengxian/limos.git /opt/limos
cd /opt/limos
git checkout main
DOMAIN=hk.limos.best bash deploy/tencent-hk/install.sh
```

第一次运行时，脚本会创建 `/opt/limos/.env.production.example` 并停下来。复制成真实 env：

```bash
cp /opt/limos/.env.production.example /opt/limos/.env.production
nano /opt/limos/.env.production
DOMAIN=hk.limos.best bash /opt/limos/deploy/tencent-hk/install.sh
```

脚本会安装 Node.js 20、Git、Nginx，配置 systemd，并把 Nginx 反代到本机 `3000` 端口。

也可以手动部署：

```bash
git clone https://github.com/toutengxian/limos.git /opt/limos
cd /opt/limos
git checkout main
npm ci
```

`hk.limos.best` 面向真实用户时使用 `main`。如需灰度测试，请另建测试域名和 dev Supabase，不要让 HK 生产入口追 `develop`。

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

## HTTPS

确认腾讯云防火墙已经放行 TCP 443 IPv4 后，用 `certbot` 给测试域名签证书：

```bash
certbot --nginx --cert-name hk.limos.best -d hk.limos.best --key-type rsa --rsa-key-size 2048 --redirect
```

验证：

```bash
curl https://hk.limos.best/healthz
curl -I https://hk.limos.best/
```

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
