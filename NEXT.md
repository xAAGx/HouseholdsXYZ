# Next session: read this first

Written 2026-09-29 at the end of the scaffold + design-system session.

## 1. Household address and uniqueness

### Decided (2026-09-29, with the user)

- **URL:** `households.xyz/<country>/<state>/<city>/<house-name>`, for example
  `/us/california/san-francisco/TheSmiths`. Country = 2-letter ISO code
  (lowercase); state and city = name slugs (official state codes are unreadable
  in many countries). A 2-letter first segment can never clash with app routes
  like `/app` or `/sign-in`.
- **Uniqueness:** house name unique **per city**, case-insensitive (display
  keeps its casing).
- **Moving:** the URL follows the household to its new city; old URLs redirect,
  but only for people who could see the household anyway (outsiders get the same
  404 as a nonexistent household).
- **Coverage:** worldwide. Countries, states/regions and cities (~150k, population
  ≥ 1,000) from **GeoNames** (CC BY 4.0: show "Place data © GeoNames" in the app),
  stored in our own database so no third-party lookup happens at sign-up.

### Still to discuss

- A public household page never lists members or children (adults-only
  publishing is already enforced in SQL). Do we need an extra rule for small
  towns, where city + family name can identify a household?

### Original open questions (kept for context)

- Is the house name unique **per city**, per country, or globally? Per-city allows
  many "TheSmiths" households but makes the city part of the identity.
- What happens when a household moves city? Does its URL change, and do old
  links redirect?
- A person can belong to several households (grandparents' home, cabin), each
  with its own location.
- Privacy: city-level location is fine for adults, but **children must never be
  locatable**. Does the URL (which reveals the city) show for private
  households at all? Today private and nonexistent households must look
  identical to outsiders, and the URL must not leak that.
- The format of each segment (country ISO code, state code, city slug) and where
  the lists of countries, states and cities come from.
- Reserved words per segment.

What exists today, to change once decided:
- `households.slug` + `slug_key` (globally unique, 3–32 ASCII characters) and
  `private.reserved_slugs` in `supabase/migrations/20260929120000_core_identity_households.sql`.
  Don't edit that migration; add a new one.
- `householdSlugSchema`, `suggestHouseholdSlug`, `householdPath()` in
  `packages/shared` (a test keeps the reserved lists in sync with SQL).
- Route `/house/:slug` in `apps/web/src/app/router.tsx`.
- `households.area` is free text today. Replace it with structured
  country/state/city.

## 2. Then build: the sign-up and onboarding flow

User decisions (2026-09-29):

- **Normal sign-up form with email and password**, not passwordless codes, so we
  collect the data we need.
- **Pick country, state and city during sign-up.**
- Clarified priority: "privacy is a must" was mainly about **children**. Adults
  can give profile and location data. Children's protections stay strict: not
  discoverable, never public, parent-managed, no self sign-up.

Planned flow (confirm the fields with the user):

1. **Create account:** name, email, password, country → state → city, and
   agreement to the Terms and Privacy policy. Adults only; parents add children
   from inside the household.
2. Confirm email (Supabase confirmations are on).
3. **Create your household** (name, and the address from §1), or **"I have an
   invite"**.
4. Invite people (optional), then land on the household home.
5. **Sign in:** email + password, "Forgot password" (reset by email).
   Two-factor is offered afterwards in settings, prompted for owners/admins.

Implementation notes:

- Today `apps/web/src/pages/SignInPage.tsx` does email OTP (8 digits,
  `signInWithOtp` / `verifyOtp`). Replace it with `signUp` / `signInWithPassword`
  / `resetPasswordForEmail`, with separate `/sign-up`, `/sign-in` and
  `/reset-password` routes.
- Password rules already exist in `supabase/config.toml`: at least 12 characters,
  upper, lower, digits and symbols. Mirror them in a zod schema in
  `packages/shared/src/auth/schemas.ts` and update the hosted project to match.
  Consider a leaked-password check (Supabase Pro), and a captcha (Turnstile) on
  sign-up.
- Profile fields (name, country/state/city) need a new migration on
  `public.profiles` with RLS, column grants, and `rls.test.ts` cases. Keep
  location **off** child profiles, or hidden. Set them in
  `private.handle_new_user()` from validated sign-up metadata, or in a
  follow-up RPC.
- Don't reveal whether an email already has an account (sign-up and reset show
  the same message).
- UI must follow DESIGN.md: these are account screens, so no Fredoka, highlights
  or tilts (§12).

## 3. Setup status on the user's machine

- pnpm 12.6.0 installed (old copies removed). Node 22.16 (24 recommended).
- `apps/web/.env` has a publishable key. The secret key was removed (it must
  never be in `VITE_*`).
- `apps/server/.env`: the user still needs to copy `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY` from the web `.env`, or the API won't start.
- If using hosted Supabase: push migrations (`pnpm exec supabase link`, then
  `pnpm exec supabase db push`), and set the email templates (`{{ .Token }}` is
  no longer needed once we switch to passwords) and SMTP.
- Scaffold committed on branch `initial-scaffold` (not yet merged into `main`
  or pushed; remote is github.com/xAAGx/HouseholdsXYZ).
