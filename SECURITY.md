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
   narrow RPCs, minimal dependency install scripts. The Supabase secret key
   (service role) exists in exactly one module, for four login operations
   only (below).
4. **Collect less.** Don't store what we don't need. Adults give a name, date
   of birth, phone and home city at sign-up; date of birth and phone live in
   `account_details` (owner-only, never in profiles, JWTs or user metadata).
   Places stop at the city: no street addresses or coordinates. No analytics
   or third-party trackers, no third-party CDNs.
5. **Children get the strongest protections.** Accounts are 18+ (enforced in
   SQL); children never sign up themselves. A parent creates a child account
   (no email, no password) and shows the child a one-time sign-in code.
   Children are never discoverable, never public, never have a location, can't
   edit their own profile, can't create households or accept invites, and only
   ever hold the child or teen role. Their membership and messaging are
   parent-managed, with permission ceilings enforced in the database.
6. **Don't leak by existence.** "Private" and "doesn't exist" look identical
   to outsiders (same 404, same message), and a moved household only redirects
   people who can see it. Identical 401s for every auth failure. Sign-up and
   password reset never reveal whether an account exists.

## How it's enforced

| Layer             | Controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Database**      | RLS on every table (tested) · default privileges revoked for `anon`/`authenticated` · column-level `UPDATE` grants · `SECURITY DEFINER` helpers only in the unexposed `private` schema with `search_path = ''` · writes to memberships only via RPCs                                                                                                                                                                                                                                                                                                                                                                                                   |
| **API**           | Supabase JWT verified per request · per-request client _as the user_ (RLS applies) · exact-origin CORS, no credentials · strict security headers · `Cache-Control: no-store` · 1 MB body limit · per-user rate limit (per-instance until a shared store is added) · uniform, non-leaky errors · config fails fast                                                                                                                                                                                                                                                                                                                                      |
| **Web**           | Strict CSP (no inline/eval scripts) · no `dangerouslySetInnerHTML` (lint) · build refuses secret keys in `VITE_*` · no source maps in production · `no-referrer` · query cache cleared on sign-out · open-redirect-safe `returnTo`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Mobile**        | Tokens in the OS keychain (expo-secure-store) when auth lands · `allowBackup: false` on Android · `EXPO_PUBLIC_*` treated as public                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Invites**       | Single-use links, 7-day expiry · only a SHA-256 hash of the token is stored, and hashes are never selectable · the token sits after `#`, so browsers never send it to a server, and the API takes it in POST bodies only · only owners can invite admins; nobody can invite children                                                                                                                                                                                                                                                                                                                                                                   |
| **Children**      | Accounts created by the API with the secret key, but only after `begin_child_account` checks the parent's `manage_children` permission and issues a one-time set-up secret that the new-user trigger redeems · sign-in codes: 8 characters (40 bits), hashed, 10 minutes, single use, one open code per child, rate-limited per IP · deleting a household deletes its children's accounts                                                                                                                                                                                                                                                              |
| **Secret key**    | `SUPABASE_SECRET_KEY` only in the API's server environment · used only by `apps/server/src/lib/admin-auth.ts` to create a child login, swap a child's sign-in code for a one-time token, delete a child login, and delete your own login (after `prepare_account_deletion` checks nothing blocks it) · lint stops other files importing it or creating Supabase clients · routes authorize the caller under RLS before calling it · approved by the project owner (child logins 2026-09-30, own-account deletion 2026-10-01)                                                                                                                           |
| **Content**       | Lists and calendar events have an audience: household, selected members, or only the creator, never wider · "only me" is private even from a child's parents (decided 2026-10-01) · only the creator changes the audience · an event can only be "for" people who can see it · leaving a household deletes your private lists and events there · guests read, members with `create_posts` write · the recipe box and meal plan are household-wide; recipe links are https only and open with `noopener noreferrer`                                                                                                                                     |
| **Live updates**  | Supabase Realtime private channels only: `household:<id>` (membership checked by `private.realtime_topic_allowed`, so two-step applies) and `profile:<id>` (that person only) · only the database sends (no insert policy on `realtime.messages`) · messages say which kind of thing changed (`{"scope":"lists"}`), never content; apps refetch through the API · private and selected-member content is announced only on the people's own channels                                                                                                                                                                                                   |
| **Notifications** | Written by database triggers for the people concerned, never for your own actions, and only to active members · readable only by the recipient, only while they're in that household; only `read_at` can change · cleared when you leave · links are in-app paths (`/h/<id>/<page>`), never URLs                                                                                                                                                                                                                                                                                                                                                       |
| **Recipe import** | The API fetches a recipe page for members who can add recipes, and returns only plain text for them to check (no HTML, scripts or images) · https on port 443 only, no credentials in links · every address checked after DNS lookup (and IP literals) against private, loopback, link-local (cloud metadata), CGNAT, multicast and reserved ranges, including IPv4 inside IPv6 · redirects followed by hand, at most 3, each checked again · HTML only, 2 MB, 8 seconds, no cookies · 10 imports a minute per person · the Node-only fetcher sits in one file (`lib/page-fetcher.ts`), kept out of the apps by lint                                   |
| **Push**          | Opt-in per device; lock-screen details off by default · subscriptions sealed with AES-GCM by the API (`PUSH_SEAL_KEY`, server env only), bound to their owner, so the database never holds a usable push address · endpoints must be a known browser push service (no requests to other hosts) · `claim_push_jobs` hands a request only the pushes its own change caused, once · payloads are end-to-end encrypted to the device (Web Push); the browser's push service (Google, Mozilla, Apple, Microsoft) sees only timing and size · signing out removes the device · the service worker only shows notifications (no caching, no network handling) |
| **Points**        | Chores, completions, rewards and the points ledger are household-only · points move only through RPCs (approval adds, reward requests deduct and refund), never direct writes · managers can't adjust their own points · a chore that needs approval always waits, and nobody approves their own (enforced in `review_chore_completion`) · turns (rotations) only between active members, and only the person whose turn it is completes the chore · one completion per chore period, with the device date allowed only within a day of the server's                                                                                                   |
| **Reminders**     | Written by a database timer (pg_cron, every minute) for the people concerned only: who an event is for (or its creator), whose turn a chore is, people who manage money, people who can see a document · each reminder is sent once (`private.sent_reminders`) · their pushes go to the API's `/internal/push`, signed with `INTERNAL_PUSH_SECRET` (server env + Supabase Vault, compared in constant time), carrying sealed subscriptions the database can't open · no secret key involved · "Remind" on a chore: chore managers only, once an hour                                                                                                   |
| **Money**         | Expenses, budgets, bills and settle-ups: `view_expenses` to see, `manage_expenses` to change (children have neither, and get the same 404 as outsiders) · splits only between active members · pocket money is a ledger kept by parents (no real money moves, no payment details stored): children see only their own; managers change other people's, never their own · points become money only at the household's rate, through an RPC that deducts the points in the same transaction                                                                                                                                                              |
| **Chat**          | Household chat for members; groups and direct chats only for the people in them, enforced by RLS (parents don't read their children's direct chats); nobody can be added from outside the household · children chat only inside their household · deleting a message removes its text and photo for everyone · photos: private `household-media` bucket, path bound to the conversation, readable only while a message shows them, links signed for an hour, redrawn on the device before upload (drops location and camera data) · 60 messages a minute · chat notifications say who and where; lock-screen text only on devices that opted in        |
| **Vault**         | Documents have an audience (household = people with `view_documents`, selected members, or only me, which stays private from parents) · only the creator changes the audience · files in the private `household-documents` bucket, path bound to the document, PDF/JPEG/PNG/WebP/HEIC up to 20 MB, uploaded as the person (storage RLS) · opening a file makes a link that works for 60 seconds · photos are redrawn before upload when the browser can (HEIC outside Safari goes up as it is) · deleting removes the files from storage first · expiry reminders go only to the creator and listed people who can see it                              |
| **Two-step**      | Once someone has a verified authenticator factor, every membership check (`private.is_household_member` and friends) and their own profile and account details require an `aal2` session, so a password-only session sees nothing, through the API or directly                                                                                                                                                                                                                                                                                                                                                                                         |
| **Auth**          | Email + password (12+ characters with lower, upper, digit and symbol; max 72 bytes) · email confirmation required · email links single use, 1 hour, token hash (any device) · password-change email · refresh-token rotation · TOTP MFA available · anonymous sign-ins off · captcha (enable on the hosted project before launch)                                                                                                                                                                                                                                                                                                                      |
| **Logs**          | Structured and redacted (tokens, emails, phones, keys) · route patterns instead of URLs · no bodies, IPs or user agents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Supply chain**  | pnpm: install scripts denied by default (`allowBuilds`), 3-day minimum release age, trust-downgrade detection, no exotic transitive sources · registry over HTTPS · lockfile committed                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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
      Secrets and tokens travel in bodies, never in URLs.
- [ ] Need the secret key? Only through `lib/admin-auth.ts`, and only after
      authorizing the caller under RLS. Anything new needs explicit sign-off.
- [ ] New content table? Follow `lists` (or `events`): audience column with a
      check that stops at `household`, policies built on the membership helpers
      (so the two-step rule applies), and tests for outsiders, guests and children.
- [ ] Should people hear about changes live? Add a `*_live` trigger
      (`private.broadcast_to_audience` for content with an audience,
      `private.live_household_scope` for household-wide tables). Messages carry
      a scope only, never content.
- [ ] Telling someone about it? Use `private.notify()` from a trigger, and add
      a test that the right people (and nobody else) get it.
- [ ] New file upload? Private bucket with MIME/size limits, a path of
      `<household>/<feature>/<item>/<file>` (`storageFileName()`), storage RLS
      that resolves the item from the path and reuses its access checks,
      short-lived signed URLs, uploads as the user, and photos redrawn on the
      device (`cleanImage`) to drop location data.
- [ ] Logging something? No personal data, no household content, no tokens.
- [ ] New dependency? Actually needed, maintained, and doesn't need install scripts.
- [ ] New third-party service? Data-processing review first: what leaves our
      infrastructure, where is it stored, and can the user opt out?

## Reporting a vulnerability

Email **security@households.xyz** (placeholder: set up before launch). Please
don't open public issues for security problems.
