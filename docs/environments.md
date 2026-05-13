# Limos Environments

Limos uses two isolated environments:

- `production`: real users, real prize pool, domain `limos.best`, branch `main`
- `development`: test users and test data only, branch `develop`

The rule is simple: development must never point at the production Supabase project or production `LIMOS_STATE_ID`.

## Isolation Model

Use separate Supabase projects.

| Layer | Development | Production |
| --- | --- | --- |
| Git branch | `develop` | `main` |
| Vercel env scope | Preview + Development | Production |
| Domain | Vercel preview URL or `dev.limos.best` | `limos.best` |
| Supabase project | `limos-dev` | current production project |
| State id | `limos-2026-dev` | `limos-2026` |
| Data | fake/test users | real users |

Do not use a single Supabase project for both environments unless this is only a temporary emergency. Separate projects are the clean boundary.

## Supabase Setup

1. Create a second Supabase project for development, for example `limos-dev`.
2. Open the SQL Editor in that dev project.
3. Run [`supabase.sql`](../supabase.sql).
4. Copy the dev project URL and publishable key.

Production keeps using the existing Supabase project and existing state id `limos-2026`.

## Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

Production scope:

```text
LIMOS_ENV=production
LIMOS_STORAGE_MODE=api
LIMOS_STATE_ID=limos-2026
LIMOS_SUPABASE_URL=https://YOUR_PROD_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_PROD_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_PROD_ADMIN_CODE
```

Preview and Development scopes:

```text
LIMOS_ENV=development
LIMOS_STORAGE_MODE=api
LIMOS_STATE_ID=limos-2026-dev
LIMOS_SUPABASE_URL=https://YOUR_DEV_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_DEV_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_DEV_ADMIN_CODE
```

The build runs `scripts/check-environment.mjs`. If a non-production Vercel build points at `LIMOS_STATE_ID=limos-2026`, the build fails before deployment.

## Local Development

For API-backed local development:

```bash
cp .env.development.example .env.local
npm run dev
```

`npm run dev` uses Vercel Dev so `/api/state` works locally.

For static single-device preview only:

```bash
npm run serve
```

Static preview does not run the API route and is not suitable for multi-user testing.

## Daily Development Flow

1. Work on `develop`.
2. Push `develop` to GitHub.
3. Test the Vercel preview deployment or branch domain.
4. Confirm the preview uses the dev Supabase project.
5. Promote only after testing passes.

Recommended branch setup:

```bash
git checkout develop
git pull --ff-only origin develop
```

## One-Command Promotion

After dev testing is done and the working tree is clean:

```bash
npm run promote:prod
```

The script:

1. Requires the current branch to be `develop`.
2. Runs `npm run check`.
3. Pushes `develop`.
4. Merges `develop` into `main`.
5. Pushes `main`.

Vercel production deployment should then start from the `main` push.

If the merge conflicts, stop and resolve the conflict manually. Do not force push production.

## Optional Dev Domain

If you want a stable dev URL, add a branch domain in Vercel:

```text
dev.limos.best -> develop
```

Keep `limos.best` attached only to production.
