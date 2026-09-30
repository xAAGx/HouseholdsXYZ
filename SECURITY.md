# Security & Privacy

Households.xyz holds some of the most personal data people have: their children,
their home, their money, their documents, where they live. **Security and privacy
are the product.** Every change is measured against the rules below.

## Principles

1. **Private by default.** Households start private, content starts
   household-only, profiles start undiscoverable. Anything wider is an explicit,
   per-item choice by someone with permission to make it.
2. **The database is the last line of defense.** Every table has Row Level
   Security. Authorization in the API or the UI is convenience, never the only
   check. If RLS would allow it, assume an attacker can do it.
3. **Least privilege everywhere.** No implicit grants, column-scoped updates,
   narrow RPCs, no service-role key in any request path, minimal dependency
   install scripts.
4. **Collect less.** Don't store what we don't need. Adults give a name, date
   of birth, phone and home city at sign-up; date of birth and phone live in
   `account_details` (owner-only, never in profiles, JWTs or user metadata).
   Places stop at the city: no street addresses or coordinates. No analytics
   or third-party trackers, no third-party CDNs.
5. **Children get the strongest protections.** Accounts are 18+ (enforced in
   SQL); children never sign up themselves. They are never discoverable, never
   public, never have a location, and their membership and messaging are
   parent-managed, with permission ceilings enforced in the database.
6. **Don't leak by existence.** "Private" and "doesn't exist" look identical
   to outsiders (same 404, same message), and a moved household only redirects
   people who can see it. Identical 401s for every auth failure. Sign-up and
   password reset never reveal whether an account exists.

## How it's enforced

| Layer            | Controls                                                                                                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database**     | RLS on every table (tested) · default privileges revoked for `anon`/`authenticated` · column-level `UPDATE` grants · `SECURITY DEFINER` helpers only in the unexposed `private` schema with `search_path = ''` · writes to memberships only via RPCs                                                                              |
| **API**          | Supabase JWT verified per request · per-request client _as the user_ (RLS applies) · exact-origin CORS, no credentials · strict security headers · `Cache-Control: no-store` · 1 MB body limit · per-user rate limit (per-instance until a shared store is added) · uniform, non-leaky errors · config fails fast                 |
| **Web**          | Strict CSP (no inline/eval scripts) · no `dangerouslySetInnerHTML` (lint) · build refuses secret keys in `VITE_*` · no source maps in production · `no-referrer` · query cache cleared on sign-out · open-redirect-safe `returnTo`                                                                                                |
| **Mobile**       | Tokens in the OS keychain (expo-secure-store) when auth lands · `allowBackup: false` on Android · `EXPO_PUBLIC_*` treated as public                                                                                                                                                                                               |
| **Auth**         | Email + password (12+ characters with lower, upper, digit and symbol; max 72 bytes) · email confirmation required · email links single use, 1 hour, token hash (any device) · password-change email · refresh-token rotation · TOTP MFA available · anonymous sign-ins off · captcha (enable on the hosted project before launch) |
| **Logs**         | Structured and redacted (tokens, emails, phones, keys) · route patterns instead of URLs · no bodies, IPs or user agents                                                                                                                                                                                                           |
| **Supply chain** | pnpm: install scripts denied by default (`allowBuilds`), 3-day minimum release age, trust-downgrade detection, no exotic transitive sources · registry over HTTPS · lockfile committed                                                                                                                                            |

## Checklist for every change

- [ ] New table? `enable row level security`, explicit `grant`s (column-scoped
      for updates), policies for each operation, and cases added to
      `packages/db/test/rls.test.ts` proving outsiders, anon and children are blocked.
- [ ] New content type? It has a `visibility` (default `household`), and its
      policies enforce `maxContentVisibilityForRole` for minors.
- [ ] New RPC? `security definer` only when required, `set search_path = ''`,
      re-checks `auth.uid()` and permissions inside, `revoke ... from public, anon`.
- [ ] New endpoint? Validated with a shared zod schema, uses `c.var.supabase`
      (never a privileged client), returns only fields the caller needs.
- [ ] New file upload? Private bucket, `householdObjectPath()`, storage RLS on
      the first path segment, short-lived signed URLs, MIME/size limits.
- [ ] Logging something? No personal data, no household content, no tokens.
- [ ] New dependency? Actually needed, maintained, and doesn't need install scripts.
- [ ] New third-party service? Data-processing review first: what leaves our
      infrastructure, where is it stored, and can the user opt out?

## Reporting a vulnerability

Email **security@households.xyz** (placeholder: set up before launch). Please
don't open public issues for security problems.
