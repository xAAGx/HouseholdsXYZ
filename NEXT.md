# Next session: read this first

Updated 2026-09-30: sign-up, places and household addresses built; moving to
hosted Supabase + Vercel.

## Decisions so far (2026-09-29, with the user)

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
  local dev and production (user's choice over separate dev/prod). Email links
  use `{{ .RedirectTo }}` so local dev gets localhost links. Accepted trade-offs:
  test accounts sit beside real users, `db:push` goes straight to production,
  `http://localhost:5180` stays on the redirect allowlist. Two Vercel projects
  (web, API). Revisit a separate dev project once there are real users.

## Done in this session (not committed yet)

- Migration `20260929180000_places_signup_household_address.sql`: `geo_*`
  tables, name/city on `profiles`, owner-only `account_details` (date of birth,
  phone), sign-up validated in `private.handle_new_user()` (strips date of birth,
  phone and city from `raw_user_meta_data` so they never ride in JWTs), per-city
  household slugs, `household_address_history` + `resolve_household_address()`,
  `create_household(name, slug, city_id)`. 52 RLS tests.
- `scripts/geo-import.ts` (`pnpm geo:import`, needs `DATABASE_URL`).
- Shared: `auth/schemas.ts` (sign-up/in/reset, password rules, 18+, phone to
  E.164), `geo/places.ts`, `householdPath(place, slug)`.
- API: `/v1/me` and `/v1/households` return `place`; creating needs `cityId`.
- Web: `/sign-up`, `/sign-in`, `/forgot-password`, `/reset-password`,
  `/auth/confirm`, `/households/new` (onboarding, city pre-filled), dashboard
  redirects there when empty, household route `/:country/:region/:city/:name`,
  placeholder `/terms` and `/privacy`. New UI: `Select`, `Combobox`,
  `PasswordField`, `Checkbox`, `FieldGroup`, `CardPage`, `LocationPicker`.
- Bundle: the phone library (`auth/phone.ts`) only loads with the auth pages,
  and the household page is lazy. Entry chunk 629 kB → 334 kB (104 kB gzip).
- `scripts/` has a tsconfig; `pnpm check` now typechecks the importer too.
- Email templates in `supabase/templates/` (token-hash links to
  `{{ .RedirectTo }}/auth/confirm`, work on any device; password-changed
  notice). Link expiry now 1 hour.
- DB scripts moved off Docker: `db:push`, `db:types` (`--linked`), `db:lint`
  (`--linked`); `db:start/stop/reset/setup` removed. README "Supabase setup"
  has the dashboard checklist.

## Next: pick one with the user

1. **Household page** at `/:country/:region/:city/:name`: call
   `resolve_household_address`; if `is_current` is false, redirect to the
   current address. Show members' view vs public profile. Private and missing
   must stay identical.
2. **Invites** ("I have an invite" in onboarding): invite links with expiry,
   role, single use; accepting needs an account.
3. **Children:** parent-managed child profiles. They can't use sign-up (the
   new-user trigger requires adult details), so they need their own
   server-side path. Needs a design decision: do children ever log in?
4. **Account settings:** change name, phone (re-verify), email, password, MFA.
5. **Legal pages:** real Terms of Service and Privacy Policy before launch
   (sign-up links to the placeholders).

Still to discuss: a public household page never lists members or children, but
in small towns city + family name can identify a household. Extra rule?

## Setup status on the user's machine

- pnpm 12.6.0 at `%LOCALAPPDATA%\pnpm\bin` (restart VS Code if `pnpm` still
  resolves to an old copy). Node 22.16 (24 recommended).
- `apps/web/.env` has a publishable key. `apps/server/.env` needs
  `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (same values as the web `.env`).
- Hosted setup in progress (user creating the Supabase and Vercel projects):
  follow README "Supabase setup" and "Deploying". Not yet known: whether the
  user owns `households.xyz`. If not, add the API's vercel.app URL to
  `connect-src` in `apps/web/vercel.json`.
- The new migration hasn't run on real Supabase yet (only PGlite). First
  `pnpm db:push` + a real sign-up is its first real test.
- Git: scaffold committed on branch `initial-scaffold` (not merged or pushed;
  remote github.com/xAAGx/HouseholdsXYZ). This session's work is uncommitted.
