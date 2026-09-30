# Next session: read this first

Updated 2026-09-30: household page, invite links and parent-managed child
accounts built (not yet pushed to the database or committed).

## Decisions so far (with the user)

- **Household URL:** `households.xyz/<country>/<state>/<city>/<house-name>`, e.g.
  `/us/california/san-francisco/TheSmiths`. Country = lowercase ISO code; state
  and city = name slugs. House name unique **per city**, case-insensitive.
- **Moving:** the URL follows the household; old URLs redirect, but only for
  people who can see the household (outsiders get the same 404 as "doesn't exist").
- **Places:** worldwide, from GeoNames (CC BY 4.0, credited next to every place
  picker), stored in our own database.
- **Sign-up:** a normal form: first and last name, email, password, date of
  birth, phone, country → state → city, accept Terms and Privacy. **18+ only.**
  The household is created right after sign-up, or the person joins by invite.
- **Privacy priority:** strictness is about **children**. Adults can give
  profile and location data. Children: never discoverable, never public, no self
  sign-up, no location, parent-managed.
- **Infrastructure (2026-09-30):** no Docker. **One** hosted Supabase project for
  local dev and production. Email links use `{{ .RedirectTo }}`. Accepted
  trade-offs: test accounts sit beside real users, `db:push` goes straight to
  production, `http://localhost:5180` stays on the redirect allowlist. API on
  Vercel (`householdsxyz-server.vercel.app`); the web app will be hosted
  elsewhere (not decided).
- **Children (2026-09-30):** parent-managed accounts. A parent adds a child from
  the household page ("Add a child account") and shows a one-time code; the
  child uses "Child sign in" on the sign-in page. The user approved the
  Supabase **secret key** in the API for this, scoped to
  `apps/server/src/lib/child-accounts.ts` (create login, code → token, delete).

## Done, uncommitted: household page, invites, children

- Migration `20260930120000_members_invites_children.sql`: invite links
  (hashed tokens, 7 days, single use, adults only, owner-only admin invites),
  `set_household_member_role`, account type ↔ role guard (children only
  child/teen), children can't edit their profile, child set-up secrets redeemed
  by `handle_new_user`, child sign-in codes (8 chars, 10 min, single use,
  redeemable only by the service role). 83 RLS tests.
- API: `GET /v1/households/by-address` (member view / public / moved),
  `PATCH /:id`, `PUT /:id/address`, `DELETE /:id` (also deletes its children's
  accounts), leave, member roles and removal, invites (list, create, revoke),
  `/v1/invites/preview|accept` (token in body), children (add, code, delete),
  `GET /public/households/by-address`, `POST /auth/child-sign-in` (10/min/IP).
- Web: household home (members, invites, add child, coming-soon tiles),
  settings page (details, address, visibility, leave, delete), `/invite#token`
  (survives sign-up via localStorage), `/sign-in/child`, "Child sign in" on the
  sign-in page. New UI: `CopyField`, `CodeDisplay`, `TextArea`, `ConfirmButton`.

## To make it work on the real project (user)

1. `pnpm db:push`, then `pnpm db:types` (check the diff against the hand-written
   types).
2. Add `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → secret
   key) to `apps/server/.env` and to the Vercel API project; redeploy.
3. Try: add a child, show the code, sign in as the child in a private window.
   Unverified against real Supabase: that GoTrue accepts the
   `@children.households.invalid` email for admin-created users, and that
   `generateLink` + `verifyOtp(type 'email')` gives the child a session.

## Next: pick one with the user

1. **Account settings:** change name, phone (re-verify), email, password, MFA.
2. **First feature (Lists)**, setting the pattern for content visibility and
   children's RLS.
3. **Ownership transfer** (owners can't leave today; they can only delete).
4. **Web hosting:** pick a host, replicate the security headers and CSP from
   `apps/web/vercel.json`, set `CORS_ALLOWED_ORIGINS` on the API.
5. **Legal pages** and **custom SMTP** before real users.

Still to discuss: a public household page never lists members or children, but
in small towns city + family name can identify a household. Extra rule?

## Setup status on the user's machine

- pnpm 12.6.0 at `%LOCALAPPDATA%\pnpm\bin`. Node 22.16 (24 recommended).
- Root `.env` holds `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
  `DATABASE_URL` for the repo scripts (never the apps). Project linked; first
  migrations pushed, places imported.
- `apps/server/.env` must keep `NODE_ENV=development` locally (production mode
  rejects the localhost CORS origin).
- Git: `initial-scaffold` and `main` pushed to github.com/xAAGx/HouseholdsXYZ at
  `bda760c`. Uncommitted since then: importer error messages, regenerated types,
  and everything in "Done, uncommitted" above.
