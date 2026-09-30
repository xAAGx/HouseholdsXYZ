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

Requirements: **Node 24** (`nvm install 24 && nvm use 24`; 22.12+ works) and
**pnpm 12** (`corepack enable` or `npm i -g pnpm@12`). No Docker: there is one
hosted Supabase project, used by local development and production alike (see
[Supabase setup](#supabase-setup)).

```bash
pnpm install

# 1. Env files (git-ignored). Fill in the project URL and publishable key.
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

# 2. Run web (http://localhost:5180) + API (http://127.0.0.1:8787)
pnpm dev
```

The RLS security suite runs against an in-memory Postgres (PGlite), so
`pnpm test` and `pnpm check` need neither Docker nor the hosted project.

## Everyday commands

| Command                                    | What it does                                                    |
| ------------------------------------------ | --------------------------------------------------------------- |
| `pnpm dev`                                 | Web + API with hot reload                                       |
| `pnpm check`                               | Typecheck, test, lint, format check. Run before every push      |
| `pnpm test`                                | Unit tests + the RLS security suite (in-memory Postgres)        |
| `pnpm build`                               | Production builds (web `dist/`, API `.vercel/output/`)          |
| `pnpm --filter @households/server preview` | Serve the built API bundle exactly as deployed                  |
| `pnpm db:new <name>`                       | New migration file                                              |
| `pnpm db:push`                             | Apply new migrations to the linked project (this is production) |
| `pnpm db:types`                            | Regenerate `packages/db/src/database.types.ts` from the project |
| `pnpm db:lint`                             | Supabase's schema linter against the linked project             |
| `pnpm geo:import`                          | Load countries, regions and cities from GeoNames                |

Changing the schema: `pnpm db:new <name>`, write the SQL, add cases to
`packages/db/test/rls.test.ts`, `pnpm check`, then `pnpm db:push` and
`pnpm db:types`. There is no staging database, so a pushed migration is live
at once, and it can never be edited afterwards (add a new one instead).

## Supabase setup

One project for local development and production. Credentials for the repo
scripts live in the git-ignored root `.env` (copy `.env.example`): a personal
access token instead of `supabase login`, the database password, and the
Session pooler URI (Supabase → Connect; the direct connection is IPv6-only).
`pnpm supabase …`, the `db:*` scripts and `geo:import` load it; the apps never
do. Never copy these values into `apps/*/.env` or Vercel.

```powershell
pnpm supabase link --project-ref <project-ref>
pnpm db:push       # migrations
pnpm db:types      # regenerate types from the live schema
pnpm geo:import    # places
```

In the dashboard, match `supabase/config.toml` (the record of these settings):

- **Authentication → Sign In / Providers:** sign-ups on, anonymous sign-ins
  off, manual linking off. Email: confirm email, secure email change and
  secure password change on; minimum password length 12 with lowercase,
  uppercase, digits and symbols; email OTP expiration 3600 (link lifetime).
- **Authentication → URL Configuration:** Site URL = the production web origin,
  no trailing slash. Redirect URLs: `http://localhost:5180` (local dev).
- **Authentication → Emails:** paste `supabase/templates/` (confirm sign-up,
  reset password, change email address; the "password changed" notification).
  Links go to `{{ .RedirectTo }}/auth/confirm`: the app passes its own origin,
  so emails from local dev link to localhost and production to production.
- **Custom SMTP** before real users: the built-in sender only emails members
  of the Supabase organization. The provider is a data processor; list it in
  the privacy policy.
- **Captcha stays off** until the sign-up form sends a captcha token.
- Afterwards, **Advisors → Security Advisor** should report nothing.

Test accounts made from local dev live beside real users; delete them in
Authentication → Users.

## Deploying (Vercel)

Two Vercel projects from this repo (production branch `main`):

| Project | Root directory | Notes                                                                                          |
| ------- | -------------- | ---------------------------------------------------------------------------------------------- |
| web     | `apps/web`     | Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`                      |
| api     | `apps/server`  | Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ALLOWED_ORIGINS`, `NODE_ENV=production` |

Set `ENABLE_EXPERIMENTAL_COREPACK=1` and Node.js 24.x on both so Vercel uses
the pinned pnpm, and set the API's function region to match the Supabase
project's region. `VITE_*` values are built into the app: redeploy after
changing them. Update the `connect-src` in `apps/web/vercel.json` if the API
domain isn't `api.households.xyz`.

# HouseholdsXYZ
