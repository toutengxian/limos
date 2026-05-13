# Limos 小瘦包 MVP

移动端优先的 5 人减重奖池 Web App。成员先上传头像、昵称和初始体重；5 个席位坐满后自动开局，到 2026-09-30 按减重率排名和结算。

## 当前功能

- 首次进入创建真实成员资料
- 昵称、头像、初始体重和成员登录码由本人注册时上传
- 成员登录后只能记录自己的体重和修改自己的资料
- 管理员旁观账号可以查看全局战况，但不能记录或修改
- 5 人到齐后自动开局并锁定初始体重
- 每天记录一次当前体重
- 实时计算瘦身率、排位、预计赢家和账本
- 按与第一名瘦身率差距加权分摊 25,000 元奖池
- Canvas 折线图展示每位成员的瘦身率走势
- 本地模式用于开发预览
- Supabase 模式用于真实多人同步

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
4. 填入项目 URL 和 publishable key：

```js
window.LIMOS_CONFIG = {
  storageMode: "supabase",
  stateId: "limos-2026",
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
  adminCodeHash: "SHA256_OF_YOUR_ADMIN_CODE",
};
```

没有 Supabase URL 和 publishable key 时，应用会回退到本地模式。这个模式不是线上真实多人同步，只适合开发预览。

## Vercel 上线

项目已带好 `vercel.json` 和构建脚本。推荐用 Vercel 部署。

1. 在 Supabase 执行 [supabase.sql](./supabase.sql)。
2. 在 Vercel 新建项目并导入这个目录对应的 Git 仓库。
3. 在 Vercel Project Settings -> Environment Variables 添加：

```text
LIMOS_STORAGE_MODE=supabase
LIMOS_STATE_ID=limos-2026
LIMOS_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_ADMIN_CODE
```

4. Vercel 构建时会自动生成 `config.js`。
5. 部署完成后，把 Vercel URL 发给 5 位成员。

成员登录码为 6-20 个字符。当前默认管理员旁观码是 `limos-25000`；如果要更换，把新旁观码做 SHA-256 后填到 `LIMOS_ADMIN_CODE_HASH`。

本地 CLI 部署：

```bash
npx vercel login
npm run deploy
```

如果使用 token 部署：

```bash
VERCEL_TOKEN=YOUR_TOKEN npx vercel --prod --yes --token YOUR_TOKEN
```

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

当前 Supabase schema 是为了快速上线设计的真实远程同步状态，适合 5 人小范围使用。成员和管理员权限在前端做产品级约束，不是严格后端鉴权；不适合开放给陌生用户。

正式版建议下一步拆成：

- `participants`
- `weight_entries`
- `profiles`
- `competitions`

并加入邀请码、登录鉴权、头像 Storage、写入审计日志。
