# Next session: read this first

Updated 2026-10-04 (later): reminders, money & pocket money, family chat and
the document vault, after looking at Cozi, FamilyWall, Splitwise, Honeydue,
Goodbudget, YNAB, Greenlight, BusyKid, RoosterMoney and LifeVault. Five
migrations are **not yet pushed**: `20261004100000_meals_upgrades`,
`20261005100000_reminders`, `20261005110000_money`, `20261005120000_chat`,
`20261005130000_vault`. Everything since `57ab173` is uncommitted.

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
  (2026-09-30) and deleting your own account (2026-10-01). Push needs no
  secret key.
- **Lists (2026-10-01):** a child's "Only me" list is truly private, hidden
  from parents too. Calendar events follow the same rule.
- **Chore approval (2026-10-01):** a chore that needs approval always waits,
  whoever did it; nobody approves their own.
- **Push (2026-10-03, my defaults, revisit with the user):** opt-in per
  device; lock-screen details off by default ("Something new for you").
- **Reminders (2026-10-04):** a database timer (pg_cron + pg_net), pushes
  signed with a shared secret in Supabase Vault; **no secret key**.
- **Pocket money (2026-10-04):** a separate balance parents keep (allowance,
  gifts, spending, savings goals); no real money moves. Optional rate turns
  points into pocket money (e.g. 100 points = 1.00).
- **Chat (2026-10-04):** household-private; groups and direct chats visible
  only to the people in them (parents don't read children's direct chats);
  children chat only within their household; lock-screen previews off by default.
- **Vault (2026-10-04):** private storage, an audience per document,
  one-minute links, expiry reminders.

## Done, uncommitted

Migrations (in order): `20261001150000_lists_chores_upgrades`,
`20261003100000_live_updates_notifications`, `20261003110000_calendar`,
`20261003120000_meals`, then the five above. 229 RLS tests, 219 shared, 92 API.

- **2026-10-01:** approval fix ("N waiting for you", send back with a note);
  lists (store sections, add several, "For you", reuse a list); chores (time
  of day, weekdays, taking turns, this-week chart, progress to rewards).
- **Live updates:** Supabase Realtime private channels (`household:<id>`,
  `profile:<id>`), sent only by database triggers, saying only what kind of
  thing changed. The web app refetches on a message and polls every 2 minutes
  while connected (10–60 seconds otherwise).
- **Notifications:** written by triggers: chore to approve (to managers),
  approved / sent back, reward asked for / given / turned down, points given
  or taken, list item put down for you, calendar event for you, meal to cook.
  Bell with unread count in the header, `/notifications` page, links via
  `/h/<household id>/<page>`. Approving settles the others' copies.
- **Push:** Web Push with VAPID (`web-push`, Node-only, `lib/web-push-sender.ts`),
  subscriptions sealed by the API, delivered after each change by
  `middleware/push-delivery.ts`. Account → "Notifications on this device".
  Service worker `apps/web/public/sw.js`, manifest and icons in `public/`.
  Signing out removes the device.
- **Calendar:** `/…/calendar`: month grid and day agenda; events with times
  or all day, multi-day, repeats (daily → yearly, until, skip one), where,
  notes, who it's for, who can see it. Also shows list items due, one-off
  chores due and planned meals. Wall-clock times in the event's time zone.
- **Meals:** `/…/meals`: the week by day (meal, recipe or "Leftovers"/"Eating
  out", who's cooking), recipe box (ingredients, method, serves, https link),
  "Shop for this week": ingredients onto a shopping list, merged and skipping
  what's already there.
- Household home: Lists, Chores, Calendar and Meals as tiles; the rest listed
  as coming soon.
- New UI: `CountBadge`; icons `bell`, `meals`, `chevronLeft/Right`.

- **Calendar upgrades (2026-10-04):** a colour per person and a "Show: Leo"
  filter; quick add in plain words ("Leo swim Tuesday 5pm every week",
  `parseQuickEvent` in shared, preview before adding); Month / Upcoming
  views (remembered per device); "Add to my calendar" (.ics made on the
  device); a warning when someone already has something then; "Today" on the
  household home.
- **Meals upgrades (2026-10-04):** import a recipe from a link (schema.org
  JSON-LD, fetched by the API with SSRF guards, see SECURITY.md); recipe page
  with cook mode (scale servings, tick ingredients, step by step, keep the
  screen on); meals "for 6" scale the shopping amounts; review what to buy
  before it goes on the list (staples and things already there unticked);
  copy the week before; recipe search, tags and "last planned".

- **Reminders (2026-10-04):** events ("10 minutes before" … "1 week
  before"; all-day ones from 9:00), chores ("Remind at 16:00" if not done,
  plus a "Remind" button for managers), bills (days before), document expiry
  and allowance day, all in the household's time zone (Settings → Time and
  money; set from the first manager's device). `private.run_scheduled()`
  every minute; pushes via `POST /internal/push`.
- **Money (2026-10-04):** `/…/money`: spending by month, add an expense with
  an optional equal split, "Who owes whom" as the fewest payments with "Mark
  as paid", budgets per category with progress, bills with "Paid" (records
  the expense, moves to the next date). Household currency in Settings.
- **Pocket money:** per child: balance, weekly allowance (paid by the timer),
  add / take out, swap points at the household rate, savings goals with
  progress, history. Children see their own on the same page.
- **Chat (2026-10-04):** `/…/chat`: household chat, groups, direct chats;
  photos (redrawn on the device to drop location), replies, edit, delete for
  everyone (moderators in the household chat), mute, unread counts, one
  notification per conversation. New UI component `ChatBubble`.
- **Vault (2026-10-04):** `/…/documents`: documents by kind, number, notes,
  whose it is, expiry with a reminder, audience; PDFs and photos up to 20 MB;
  "Coming up" for the next 90 days; view or download through one-minute links.

## To do on the real project (user)

1. `pnpm db:push` (the five migrations above), then `pnpm db:types` and
   compare with the hand-written types. The reminders migration enables
   `pg_cron` and `pg_net`; if the push says they aren't available, turn them
   on in Supabase → Database → Extensions and push again.
2. Reminder pushes (optional; reminders reach the inbox without it): make a
   secret (`openssl rand -hex 32`), set `INTERNAL_PUSH_SECRET` on the API
   (`apps/server/.env` and Vercel), and in the Supabase SQL editor run
   `select vault.create_secret('<secret>', 'households_push_secret');` and
   `select vault.create_secret('https://householdsxyz-server.vercel.app/internal/push', 'households_push_url');`.
   Needs the push keys from step 3.
3. Push (optional; the inbox works without it): generate keys (see
   `apps/server/.env.example`), set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `PUSH_SEAL_KEY` in `apps/server/.env` and on Vercel,
   redeploy the API.
4. Supabase dashboard → Realtime → Settings: turn off "Allow public access"
   (we only use private channels).
5. Try: two browsers in one household; chat between them (a photo too); add
   an event with "10 minutes before" for someone; split an expense and mark
   it paid; give a child an allowance and a savings goal; add a passport with
   an expiry date and open its file.

## Next: pick with the user

1. **Web hosting** + security headers (the CSP in `apps/web/vercel.json`
   already allows `wss://*.supabase.co`), then custom SMTP, captcha, legal pages.
2. **Home inventory** (warranties, where things are) or **Memories** (photo
   albums), the last two tiles.
3. **Phone verification** (needs an SMS provider: a data-processor decision).

Still to discuss: small towns and public household pages (city + family name).

## Setup status on the user's machine

- pnpm 12.6.0; Node 22.16. Root `.env` holds the repo-script credentials.
- `apps/server/.env`: `NODE_ENV=development` locally; `SUPABASE_SECRET_KEY` set
  there and on Vercel for child logins and account deletion. Push keys not set.
- Git: `main` and `initial-scaffold` at `57ab173` on GitHub; everything above
  is uncommitted.
