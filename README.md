# Limos 小瘦包

移动端优先的减重奖池 Web App。参赛用户、陪伴用户和管理员在同一个小队里记录体重、查看趋势和排名；参赛用户参与 25,000 元奖池结算，陪伴用户只记录和围观，不参与分钱。

## 当前生产架构

正式入口：

- `https://limos.top`
- `https://www.limos.top`

生产链路：

```text
用户浏览器
  -> limos.top
  -> 腾讯云北京轻量服务器 81.70.48.181
  -> Nginx HTTPS
  -> Node 单服务 /opt/limos
  -> 同源 /api/*
  -> Supabase Prod
```

浏览器只访问本站域名。Supabase 只由服务器端 API 访问，避免用户设备直接连接 `*.supabase.co`。

## 核心功能

- 首次加入创建真实成员资料：昵称、头像、身高、初始体重和登录码
- 参赛用户占 5 个奖池席位，参与排名和结算
- 陪伴用户可以记录体重、看曲线和排名，不参与奖金分配
- 管理员可以查看全局战况并维护开局前成员，不能记录体重
- 5 位参赛用户到齐后自动开局并锁定初始体重
- 每天记录一次当前体重
- 个人健康看板展示身高、体重、BMI 和变化状态
- 看板、曲线、上秤日历和排位支持“全部 / 仅参赛”筛选
- 按减重率排名，并按与第一名的差距加权分摊奖池
- Canvas 折线图展示每位成员的减重率走势
- `/api/diagnostics` 用于线上健康检查
- `/api/backup` 用于生产备份

## 环境

只保留两套环境：

| 环境 | 用途 | 分支 | 数据 |
| --- | --- | --- | --- |
| Development | 开发和测试 | `develop` | Supabase Dev, `limos-2026-dev` |
| Production | 真实用户 | `main` | Supabase Prod, `limos-2026` |

详细说明见 [docs/environments.md](./docs/environments.md)。

## 本地开发

创建本地环境变量：

```bash
cp .env.development.example .env.local
```

填入 dev Supabase URL、publishable key 和管理员码 hash 后启动：

```bash
npm run dev
```

默认监听：

```text
http://127.0.0.1:3000
```

单机静态预览仍可用，但不会运行 API，也不适合多人测试：

```bash
npm run serve
```

## 检查

```bash
npm run check
```

这个命令会做语法检查和单元测试。

## 生产部署

生产部署到腾讯云大陆服务器，见 [docs/production-mainland.md](./docs/production-mainland.md)。

一键部署：

```bash
npm run deploy:prod
```

当前服务器关键路径：

- App 目录：`/opt/limos`
- 环境变量：`/opt/limos/.env.production`
- Node 服务：`limos.service`
- Nginx 服务：`nginx.service`
- 备份定时器：`limos-backup.timer`

## Supabase

首次创建 Supabase 项目时执行：

```text
supabase.sql
```

生产状态使用：

```text
LIMOS_STATE_ID=limos-2026
```

开发状态使用：

```text
LIMOS_STATE_ID=limos-2026-dev
```

开发环境不要连接生产 Supabase 项目，也不要使用生产 `LIMOS_STATE_ID`。

## 重要说明

当前系统是小范围真实使用的轻量实现，适合 5 位参赛用户加少量陪伴用户。成员和管理员权限主要是产品级约束，不是严格后端鉴权；不要开放给陌生用户。
