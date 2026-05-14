# Limos 小瘦包 MVP

移动端优先的 5 人减重奖池 Web App。成员先上传头像、昵称和初始体重；5 个席位坐满后自动开局，到 2026-09-30 按减重率排名和结算。

## 当前功能

- 首次进入创建真实成员资料
- 昵称、头像、初始体重和成员登录码由本人注册时上传
- 成员登录后只能记录自己的体重和修改自己的资料
- 陪伴用户可以记录体重、查看曲线和排位，但不参与奖金结算
- 管理员账号可以查看全局战况并维护开局前成员，但不能记录体重
- 开局前成员可以退出小队，管理员可以移除误加入成员
- 5 人到齐后自动开局并锁定初始体重
- 每天记录一次当前体重
- 实时计算瘦身率、排位、预计赢家和参赛账本
- 按与第一名瘦身率差距加权分摊 25,000 元奖池
- Canvas 折线图展示每位成员的瘦身率走势
- 看板、曲线、上秤日历和排位支持“全部 / 仅参赛”筛选
- 本地模式用于开发预览
- Vercel API 代理 Supabase，用于真实多人同步
- 可用 Node 单服务部署到腾讯云香港轻量/CVM，降低国内用户访问 Vercel 的不稳定性

## 本地预览

直接打开也可以运行，但只适合单机预览：

```text
index.html
```

或启动静态服务器：

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

访问：

```text
http://127.0.0.1:5173/
```

## Supabase 同步

1. 在 Supabase 新建项目。
2. 打开 Supabase SQL Editor，执行 [supabase.sql](./supabase.sql)。
3. 复制 `config.example.js` 的内容到 `config.js`。
4. 使用同源 API 模式：

```js
window.LIMOS_CONFIG = {
  environment: "development",
  storageMode: "api",
  stateId: "limos-2026-dev",
  apiEndpoint: "/api/state",
  adminCodeHash: "SHA256_OF_YOUR_ADMIN_CODE",
};
```

线上浏览器只请求本站的 `/api/state`。Vercel Serverless Function 再用环境变量连接 Supabase，避免用户设备直接访问 `*.supabase.co` 或第三方 SDK CDN。

没有 API 或 Supabase 环境变量时，应用会回退到本地模式。这个模式不是线上真实多人同步，只适合开发预览。

## Vercel 上线

项目已带好 `vercel.json` 和构建脚本。推荐用 Vercel 部署。

1. 在 Supabase 执行 [supabase.sql](./supabase.sql)。
2. 在 Vercel 新建项目并导入这个目录对应的 Git 仓库。
3. 在 Vercel Project Settings -> Environment Variables 添加：

```text
LIMOS_ENV=production
LIMOS_STORAGE_MODE=api
LIMOS_STATE_ID=limos-2026
LIMOS_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_ADMIN_CODE
```

4. Vercel 构建时会自动生成 `config.js`，其中只包含 `/api/state`，不会把 Supabase URL 和 key 暴露给浏览器。
5. 部署完成后，把 Vercel URL 发给参赛成员和陪伴用户。

成员登录码为 6-20 个字符。当前默认管理员码是 `limos-25000`；如果要更换，把新管理员码做 SHA-256 后填到 `LIMOS_ADMIN_CODE_HASH`。

本地 CLI 部署：

```bash
npx vercel login
npm run deploy
```

如果使用 token 部署：

```bash
VERCEL_TOKEN=YOUR_TOKEN npx vercel --prod --yes --token YOUR_TOKEN
```

## 国内访问阶段 1

如果用户在国内不翻墙访问 Vercel 很慢，可以先把同一套前端和 `/api/state` 迁到腾讯云香港轻量/CVM，Supabase 暂时保持不变。详见 [docs/mainland-stage1.md](./docs/mainland-stage1.md)。

本仓库已提供通用 Node 服务入口：

```bash
LIMOS_ENV_FILE=.env.production npm start
```

## 开发与生产环境

开发环境和生产环境按分支、Vercel 环境变量、Supabase 项目三层隔离。详见 [docs/environments.md](./docs/environments.md)。

- `develop`：开发测试，连接 dev Supabase，使用 Preview/Development 环境变量
- `main`：正式环境，连接生产 Supabase，使用 Production 环境变量
- `npm run promote:prod`：从 `develop` 检查并合并到 `main`，触发生产部署

## 手动部署

如果不用 Vercel，可以先运行：

```bash
npm run build
```

然后把这些文件上传到任意静态托管服务：

- `index.html`
- `styles.css`
- `app.js`
- `config.js`

## 重要说明

当前 Supabase schema 是为了快速上线设计的真实远程同步状态，适合 5 位参赛成员加少量陪伴用户的小范围使用。成员和管理员权限在前端做产品级约束，不是严格后端鉴权；不适合开放给陌生用户。

正式版建议下一步拆成：

- `participants`
- `weight_entries`
- `profiles`
- `competitions`

并加入邀请码、登录鉴权、头像 Storage、写入审计日志。
