# Households.xyz

A private home for your household: members, chores, lists, calendar, expenses,
documents, memories, and (optionally) a public profile and neighborhood network.
**Security and privacy come first. Read [SECURITY.md](SECURITY.md) before contributing.**
**All UI follows the design system in [DESIGN.md](DESIGN.md)** (preview it at `/design` in dev).

## Stack

| Part     | Tech                                                                 |
| -------- | -------------------------------------------------------------------- |
| Web      | Vite, React, styled-components, React Router, TanStack Query         |
| API      | Hono, deployed as a Vercel Function (Build Output API)               |
| Mobile   | Expo (React Native), placeholder for now                             |
| Database | Supabase (Postgres + Auth + Storage), one project shared by all apps |
| Monorepo | pnpm workspaces + Turborepo, TypeScript 6, ESLint, Prettier, Vitest  |

## Layout

```
apps/
  web/          Vite + React SPA                         → Vercel (static)
  server/       Hono API                                  → Vercel Function
  mobile/       Expo app (placeholder)
packages/
  shared/       Domain logic for every app: zod schemas, roles & permissions,
                privacy rules, API error contract, redaction, safe redirects
  db/           Supabase types (generated), typed client factory, storage paths,
                and the RLS security test-suite
  api-client/   End-to-end typed API client (Hono RPC), used by web and mobile
  theme/        Design tokens + semantic themes, shared by web and mobile (see DESIGN.md)
  tsconfig/     Shared TypeScript configs
supabase/
  migrations/   SQL migrations: the schema and all RLS policies
  config.toml   Local Supabase config (hardened)
```

Workspace packages ship TypeScript source. Vite and Metro compile them directly
(with HMR across packages), and the API build bundles them into one file.

### How the typing flows

```
supabase/migrations/*.sql ──pnpm db:types──► @households/db (Database, Enums)
                                                 │
                              @households/shared (roles, schemas, DTOs)
                                 │                        │
                     apps/server (Hono routes) ──AppType──► @households/api-client
                                                                     │
                                                          apps/web, apps/mobile
```

Change a column or a route, and every consumer that relies on it fails to type-check.

## Getting started

Requirements: **Node 24** (`nvm install 24 && nvm use 24`; 22.12+ works),
**pnpm 12** (`corepack enable` or `npm i -g pnpm@12`), and **Docker** (for
local Supabase).

```bash
pnpm install

# 1. Local Supabase (Postgres, Auth, Studio, local email inbox)
pnpm db:start            # prints the API URL and publishable key
pnpm db:types            # regenerate DB types from the migrations

# 2. Env files (git-ignored). Paste the publishable key from step 1.
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

# 3. Run web (http://localhost:5180) + API (http://127.0.0.1:8787)
pnpm dev
```

Sign-in codes sent locally land in the local email inbox (its URL is shown by `pnpm db:start`).

## Everyday commands

| Command                                    | What it does                                               |
| ------------------------------------------ | ---------------------------------------------------------- |
| `pnpm dev`                                 | Web + API with hot reload                                  |
| `pnpm check`                               | Typecheck, test, lint, format check. Run before every push |
| `pnpm test`                                | Unit tests + the RLS security suite (no Docker needed)     |
| `pnpm build`                               | Production builds (web `dist/`, API `.vercel/output/`)     |
| `pnpm --filter @households/server preview` | Serve the built API bundle exactly as deployed             |
| `pnpm db:new <name>`                       | New migration file                                         |
| `pnpm db:reset`                            | Recreate local DB from migrations + seed                   |
| `pnpm db:types`                            | Regenerate `packages/db/src/database.types.ts`             |
| `pnpm db:lint`                             | Supabase's schema linter (security & performance advisors) |

## Deploying (Vercel)

Two Vercel projects from this repo:

| Project | Root directory | Notes                                                                                          |
| ------- | -------------- | ---------------------------------------------------------------------------------------------- |
| web     | `apps/web`     | Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`                      |
| api     | `apps/server`  | Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ALLOWED_ORIGINS`, `NODE_ENV=production` |

Set `ENABLE_EXPERIMENTAL_COREPACK=1` on both so Vercel uses the pinned pnpm.
Update the `connect-src` in `apps/web/vercel.json` if the API domain isn't
`api.households.xyz`.

On the hosted Supabase project, mirror `supabase/config.toml`'s auth settings:
email OTP length 8, expiry 10 min, confirmations on, TOTP MFA on,
anonymous sign-ins off, and turn on captcha (Turnstile).
# HouseholdsXYZ
