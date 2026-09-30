# Next session: read this first

Updated 2026-10-01: Lists, Chores & rewards, account settings, ownership
hand-over and database-enforced two-step sign-in built. Not yet pushed to the
database or committed.

## Decisions so far (with the user)

- **Household URL:** `households.xyz/<country>/<state>/<city>/<house-name>`, name
  unique **per city**; moving redirects members only. Places from GeoNames.
- **Sign-up:** first/last name, email, password, date of birth, phone, city,
  Terms. **18+ only.** Household right after sign-up, or join by invite.
- **Privacy priority:** strictness is about **children**: never discoverable,
  never public, no self sign-up, no location, parent-managed.
- **Infrastructure:** no Docker; **one** hosted Supabase project for dev and
  production; API on Vercel (`householdsxyz-server.vercel.app`); web host not
  decided.
- **Children (2026-09-30):** parent-managed accounts, one-time sign-in codes,
  "Child sign in" on the sign-in page.
- **Secret key:** only `apps/server/src/lib/admin-auth.ts`: child logins
  (2026-09-30) and deleting your own account (2026-10-01).
- **Lists (2026-10-01):** a child's "Only me" list is truly private, hidden
  from parents too.

## Done, uncommitted

- Migrations: `20261001120000_lists.sql` (lists, members, items; audiences;
  cleanup when someone leaves), `20261001130000_chores_rewards.sql` (chores,
  completions with approval, points ledger, rewards, requests, adjustments),
  `20261001140000_account_ownership_mfa.sql` (two-step enforced in the
  membership helpers, ownership hand-over, account deletion). 129 RLS tests.
- API: `/v1/households/:id/lists…`, `/v1/households/:id/chores` (board) and
  chore/reward/points actions, `/v1/me` (PATCH, details, phone, export,
  deletion check, DELETE), `POST /v1/households/:id/owner`.
- Web: household home links to Lists and Chores; lists index and list page
  (items, done, reorder, sharing, archive); chores page (today, approvals,
  rewards, points, streaks, manage chores, history, give/take points);
  `/account` (profile, personal details, email, password with
  re-authentication, two-step setup, sign out elsewhere, data export, delete
  account); `/sign-in/verify`; hand-over in household settings.

## To do on the real project (user)

1. `pnpm db:push` (three migrations), then `pnpm db:types` and compare.
2. Supabase dashboard → Authentication → Multi-Factor: TOTP on (default).
3. Try: a list shared with one person; a chore for a child, done on the
   child's device, approved by a parent; a reward request; turn on two-step
   sign-in and sign in again; download your data.

## Next: pick with the user

1. **Shared calendar** (next content type, same audience pattern as lists).
2. **Web hosting** + security headers, then custom SMTP, captcha, legal pages.
3. **Realtime** for lists/chores (today they refresh every 10–15 seconds).
4. **Phone verification** (needs an SMS provider: a data-processor decision).

Still to discuss: small towns and public household pages (city + family name).

## Setup status on the user's machine

- pnpm 12.6.0; Node 22.16. Root `.env` holds the repo-script credentials.
- `apps/server/.env`: `NODE_ENV=development` locally; `SUPABASE_SECRET_KEY` set
  there and on Vercel for child logins and account deletion.
- Git: `main` and `initial-scaffold` at `5b0fb7e` on GitHub; this session's
  work is uncommitted.
