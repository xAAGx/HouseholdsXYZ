# Households.xyz

**Start every session by reading NEXT.md** (open decisions and the next task).

pnpm + Turborepo monorepo: `apps/web` (Vite/React/styled-components), `apps/server`
(Hono on Vercel), `apps/mobile` (Expo, deferred), shared `packages/*`, one Supabase
database. See README.md for layout and commands.

## Security & privacy are the product

Read SECURITY.md and follow its checklist on every change. Non-negotiables:

- Every new table: RLS enabled, explicit grants (column-scoped updates), policies
  per operation, and tests in `packages/db/test/rls.test.ts`.
- Private by default: households `private`, content `household`, profiles not
  discoverable. Children: never discoverable or public (enforce in SQL, not just UI).
- The API queries Supabase **as the user** (`c.var.supabase`) so RLS always applies.
  There is no service-role client. Adding one needs explicit sign-off.
- Never log personal data, household content, tokens or full URLs. Use the logger
  (it redacts); never `console.log` in server code.
- No `dangerouslySetInnerHTML`, no third-party scripts/CDNs/trackers, no secrets in
  `VITE_*` or `EXPO_PUBLIC_*`.
- Outsiders must not be able to tell "private" from "doesn't exist".

## Design system: follow DESIGN.md for every UI change

The brand is "Playhouse · Balanced" (friendly, grown-up). Before building or changing
any UI, read DESIGN.md and look at `/design` (dev only) and the homepage in
`apps/web/src/features/marketing/` (the reference implementation). Non-negotiables:

- Build screens from `apps/web/src/components/ui`. Missing something? Add a component
  (tokens only), export it from `components/ui/index.ts`, show it on `/design`, and
  document it in DESIGN.md §7. No one-off styled copies of existing components.
- Colors and fonts come only from the theme (`theme.colors.*`, `theme.fonts.*`).
  Raw hex/rgb/hsl and hard-coded `font-family` fail lint in `apps/web/src`.
- Three faces, one job each: Bricolage Grotesque = titles, Figtree = everything read
  or typed, Fredoka = short playful accents only, via `Playful`/`PointsBadge`/`NameTag`.
  Never Fredoka, highlights or tilts on money, documents, permissions, privacy,
  errors or account screens (DESIGN.md §12).
- One primary button per section, at most one `Highlight` per view, no tilt inside
  the app, no emoji, sentence case.
- New color pairings need ≥ 4.5:1 contrast. Every page works at 390px and 1440px.
- Screenshot changed screens at both widths and compare them against `/design` and
  the homepage before calling UI work done.

## Conventions

- Put domain logic, zod schemas and shared types in `@households/shared` so web,
  server and mobile use one definition. Validate with the same schema client-side
  and in the API.
- DB enums come from `@households/db` `Constants`. After any migration run
  `pnpm db:types`. `ROLE_DEFAULT_PERMISSIONS` and reserved slugs mirror SQL
  blocks marked `-- @role-permissions` / `-- @reserved-slugs`; a test enforces sync.
- Migrations are append-only; never edit one that has been applied anywhere.
- API routes are chained on `new Hono<AppEnv>()` so `AppType` (Hono RPC) stays
  inferred. Files reachable from `apps/server/src/app-type.ts` must not use Node
  globals (`process`, `Buffer`): web and mobile type-check them.
- Errors: throw `ApiError` (from shared) with user-safe messages; put internals in
  `cause`. Map DB errors with `toApiError()`.
- styled-components: transient props (`$variant`), theme values via `theme.*`,
  shared helpers in `components/ui/mixins.ts`.
- Mobile (later): check `apps/mobile/AGENTS.md`; add packages with `npx expo install`.
- pnpm refuses packages younger than 3 days and dependency install scripts not in
  `allowBuilds`. Don't bypass either without a reason noted in the commit.

## Before finishing a task

Run `pnpm check` (typecheck, tests incl. RLS suite, lint, prettier).
