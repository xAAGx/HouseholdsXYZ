# Households.xyz design system: Playhouse · Balanced

**Friendly, grown-up.** Warm enough for kids earning chore points, calm enough for
insurance papers. Every screen we build follows this document. If a design need
isn't covered here, extend the system (tokens → components → this guide) instead
of styling a one-off.

> **Before you build any UI:** read this file, open `/design` in the dev server
> (`pnpm dev:web` → http://localhost:5180/design), and look at the homepage
> (`apps/web/src/features/marketing/`), which is the reference implementation.

---

## 1. Principles

1. **Fun lives in the accents; structure stays calm.** Playfulness comes from the
   logo, sticker labels, points badges, one highlighted phrase and color tints. It
   never comes from layout, headline fonts, body text or chaotic color.
2. **Serious things look serious.** Money, documents, permissions, privacy
   settings, errors and account screens use no playful face, no highlights, no
   tilts and no bright fills. Kids' features (chores, points) may use more accents.
3. **Color is a signal, not wallpaper.** Big areas are cream, white or soft tints.
   Bright colors appear in small doses: the primary button, a highlight, a status
   dot, a star.
4. **One loud thing per view.** One primary button per section, at most one
   highlight per screen, at most one dark (inverse) band per page, twice on long
   marketing pages.
5. **Privacy is visible.** Wherever content is shared, show who can see it (the
   audience chips and the "Only parents can see this" pattern).

## 2. Where things live

| What                               | Where                                                       |
| ---------------------------------- | ----------------------------------------------------------- |
| Raw tokens (palette, scales)       | `packages/theme/src/tokens.ts`                              |
| Semantic theme (light/dark), types | `packages/theme/src/theme.ts`                               |
| Web components                     | `apps/web/src/components/ui/` (import from `components/ui`) |
| Icons                              | `apps/web/src/components/icons/`                            |
| App header                         | `apps/web/src/components/app/AppHeader.tsx`                 |
| Reference implementation           | `apps/web/src/features/marketing/` (homepage)               |
| Living style guide (dev only)      | `apps/web/src/features/design-system/` → `/design`          |

Rules that are **lint-enforced** in `apps/web/src`:

- No raw colors (`#hex`, `rgb()`, `hsl()`): use `theme.colors.*`.
- No hard-coded `font-family`: use `theme.fonts.*`.

## 3. Color

Always pick colors **by role** through `props.theme.colors`, never by hue.

### Semantic roles

| Token                        | Light value               | Use for                                                         |
| ---------------------------- | ------------------------- | --------------------------------------------------------------- |
| `background`                 | cream `#FFF8EC`           | Page background                                                 |
| `surface`                    | white `#FFFFFF`           | Cards, inputs, menus                                            |
| `surfaceMuted`               | `#FFF1DC`                 | Hover rows, stripes, code blocks                                |
| `inverse` / `onInverse`      | ink / cream               | Dark bands, footer, featured plan                               |
| `onInverseMuted`             | cream 78%                 | Body text on inverse                                            |
| `text`                       | ink `#1F1B2E`             | Headings and primary text                                       |
| `textMuted`                  | `#5A5568`                 | Body copy, descriptions, meta                                   |
| `textSubtle`                 | `#8A8597`                 | **Placeholders and disabled only** (3.6:1, not for information) |
| `outline` / `shadow`         | ink                       | The 2px signature outline and hard shadow                       |
| `hairline`                   | ink 12%                   | Dividers inside cards and lists                                 |
| `primary` / `onPrimary`      | yellow / ink              | Main action, highlight, selected chip                           |
| `primaryHover`               | `#FFC61A`                 | Hover on primary                                                |
| `focusRing`                  | ink                       | Keyboard focus                                                  |
| `danger` / `dangerSurface`   | coral deep / coral tint   | Errors, destructive actions                                     |
| `success` / `successSurface` | grass deep / grass tint   | Paid, done, saved                                               |
| `warning` / `warningSurface` | yellow deep / yellow tint | Due soon, needs attention                                       |
| `eyebrow`                    | coral deep                | Section eyebrow labels                                          |

### Accents

Five accents: **yellow, coral, sky, grass, grape**. Each has three tones in
`theme.colors.accents[name]`:

- `tint`: backgrounds of areas (soft cards, icon chips, tinted sections).
- `deep`: icons and short text placed **on that tint**.
- `base`: small graphic details only (status dots, the star, a done tick). Never
  text, never large areas.

Rules:

- Yellow is the brand color. It means "the main thing": the primary button, the
  highlight and the selected choice. Don't use yellow for decoration.
- Accents **categorize**, they don't rank. Keep a feature's accent consistent
  everywhere (chores → yellow, calendar → coral, lists → sky, money → grass,
  documents/vault → grape, memories → coral, home → sky, chat → grass).
- Don't put two different tinted areas side by side unless they're a set (like
  the four generation cards).
- Semantic states (danger/success/warning) are separate from accents. Never use
  grass to mean "success" by hand; use `success`.

### Contrast (WCAG 2.2), verified

| Pair                                            | Ratio              |
| ----------------------------------------------- | ------------------ |
| text on background / surface                    | 15.9 / 16.7        |
| textMuted on background / surface               | 6.8 / 7.2          |
| textMuted on yellow / grape tint                | 6.3 / 5.8          |
| onPrimary on primary                            | 11.6               |
| eyebrow on background                           | 5.4                |
| danger / success / warning on their surfaces    | 4.7 each           |
| accent `deep` on its `tint`                     | 4.7 to 6.3         |
| onInverse / onInverseMuted / primary on inverse | 15.9 / 10.0 / 11.6 |

Any new pairing must reach **4.5:1** for text (3:1 for large text and UI
graphics). Check it before adding it.

## 4. Typography

Three faces, each with **one job**. Fonts are self-hosted (`@fontsource-variable/*`,
imported once in `main.tsx`). Never load fonts from a CDN.

| Face                    | Token           | Role                                                                                         |
| ----------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| **Bricolage Grotesque** | `fonts.display` | Titles only: hero, page, section, card titles, big numbers                                   |
| **Figtree**             | `fonts.body`    | Everything people read or type: body, labels, buttons, inputs, tables                        |
| **Fredoka**             | `fonts.playful` | **Accents only**: the logo, sticker titles ("Today"), points badges, name tags, step numbers |

### Fredoka rules (the ones that keep us "balanced")

- Only through `<Playful>`, `PointsBadge`, `NameTag` or the `Logo`.
- Max about three words. Never a sentence, never a headline, never body text.
- **Never** in money, documents, permissions, privacy settings, errors, legal or
  account screens.

### Scale (components already encode it)

| Component      | Face                   | Size            | Notes                                 |
| -------------- | ---------------------- | --------------- | ------------------------------------- |
| `HeroTitle`    | display 700            | 44 → 74 (fluid) | Marketing hero only, one per page     |
| `PageTitle`    | display 700            | 28 → 40 (fluid) | Top of every app screen, one per page |
| `SectionTitle` | display 700            | 32 → 52 (fluid) | Section h2                            |
| `CardTitle`    | display 600            | 20              | Cards, list items, form sections      |
| `Eyebrow`      | body 800, caps, +0.1em | 13              | Above section titles; optional        |
| `Lede`         | body 400               | 20              | One intro paragraph under a title     |
| `Text`         | body 400               | 16              | Body copy                             |
| `Muted`        | body 600               | 14              | Meta: counts, dates, helper text      |
| Buttons        | body 700               | 14 / 15 / 17    |                                       |

- Titles use tight tracking (−0.03em to −0.035em) and `text-wrap: balance`.
- Sentence case everywhere ("Create a household", not "Create A Household").
  Eyebrows are the only uppercase text.
- Keep reading width near 65 characters (`Lede` caps at 32em).
- Use `font-variant-numeric: tabular-nums` for amounts and anything that lines up.

## 5. Shape and depth

The Playhouse signature: **2px ink outline + hard offset shadow** (no blur).

| Token                    | Value          | Use                                                        |
| ------------------------ | -------------- | ---------------------------------------------------------- |
| `borderWidths.outline`   | 2              | Outlined cards, buttons, inputs, chips                     |
| `borderWidths.hairline`  | 1              | Dividers, `plain` cards                                    |
| `shadowOffsets.sm`       | 3              | Buttons at rest                                            |
| `shadowOffsets.md`       | 4              | Outlined cards; buttons on hover                           |
| `shadowOffsets.pressed`  | 1              | Buttons while pressed                                      |
| `radii.sm/md/lg/xl/pill` | 8/12/18/28/999 | Small bits / buttons & inputs / cards / big panels / pills |

- **Outlined** (outline + shadow) marks a primary object people act on: a plan, a
  feature group, a form, a main card. Don't outline everything; a page of
  outlined boxes loses its hierarchy.
- **Soft** (tint, no outline) groups related secondary content.
- **Plain** (hairline, no shadow) is for dense app content: long lists, settings,
  tables.
- **Tilt** is a marketing-only device for hero "stickers", within ±2° (the logo
  badge is −4° by design). **Nothing inside the app is ever tilted.**
- Hover: lift 1px (shadow grows to 4). Press: push 2px (shadow shrinks to 1).
  Already built into `Button`.

## 6. Spacing and layout

- 4-point scale: `space[1..10]` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Container max width 1200px with 24px gutters (`Container`, `Page`).
- Sections are 96px apart (`layout.sectionGap`). Section header to content: 40px.
- Use `Stack`, `Row` and `Grid` with `$gap` instead of margins between siblings.
- Breakpoints (desktop-first, `max-width`): sm 520 · md 800 · lg 980 · xl 1200.
  `Grid` collapses to 2 columns at lg and 1 at sm by itself.
- Minimum touch target 44px (`layout.hitTarget`). Buttons and inputs meet it.
- Every page must work at 390px wide with no horizontal scroll.

## 7. Components

Import from `components/ui`. Check `/design` to see them all.

| Component                                                                                                         | Use                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` / `ButtonLink` / `ButtonAnchor`                                                                          | Actions. Variants: `primary` (one per section), `secondary`, `ghost`, `inverse` (on dark bands), `danger` (always confirm first). Sizes `sm/md/lg`. |
| `Card`                                                                                                            | `outlined` (default), `soft` + `$tone`, `plain`, `inverse`. `CardList` for hairline-separated rows.                                                 |
| `IconChip`                                                                                                        | Line icon on an accent tint. Sizes 32/36/44/56. The standard way to show a feature, category or file type.                                          |
| `Pill` + `StatusDot`                                                                                              | Static labels ("Private by default").                                                                                                               |
| `Chip`                                                                                                            | Selectable options (audience, filters). Selected = primary fill.                                                                                    |
| `PointsBadge`                                                                                                     | Points and streaks. Kids' contexts only.                                                                                                            |
| `NameTag`                                                                                                         | Playful name/group label ("Teens").                                                                                                                 |
| `StatusText`                                                                                                      | "Paid", "Due Fri", "Overdue": success / warning / danger.                                                                                           |
| `TextField`                                                                                                       | Every text input: label always visible, hint and error wired for screen readers.                                                                    |
| `TextArea`                                                                                                        | Multi-line text (descriptions, notes). Same label, hint and error wiring as `TextField`.                                                            |
| `Select`                                                                                                          | Short fixed lists (country, state). A native `<select>`, so keyboards, screen readers and phone pickers all work.                                   |
| `Combobox`                                                                                                        | Long lists people type into (cities). The parent does the searching; `getDescription` tells same-named options apart.                               |
| `PasswordField`                                                                                                   | Every password input: Show/Hide toggle. `showRequirements` for new passwords (checklist uses icon + text, never color alone).                       |
| `Checkbox`                                                                                                        | Consent and yes/no choices. The label can contain links.                                                                                            |
| `FieldGroup`                                                                                                      | A titled group of related fields in a form ("Where you live"). A real fieldset + legend.                                                            |
| `CopyField`                                                                                                       | A read-only value with a Copy button (invite links). Falls back to selecting the text when the clipboard is blocked.                                |
| `CodeDisplay`                                                                                                     | A one-time code to read out or type elsewhere (a child's sign-in code). Body face, large and spaced; screen readers hear one character at a time.   |
| `ConfirmButton`                                                                                                   | Every destructive action. The first press asks a plain question; the danger button does it; Cancel gets focus.                                      |
| `ErrorText`                                                                                                       | Inline errors.                                                                                                                                      |
| `HeroTitle`, `PageTitle`, `SectionTitle`, `CardTitle`, `Eyebrow`, `Lede`, `Text`, `Muted`, `Highlight`, `Playful` | Typography roles (§4).                                                                                                                              |
| `Container`, `Section` (`default` / `inverse` / `tint`), `SectionHeader`, `Stack`, `Row`, `Grid`, `Page`          | Layout (§6).                                                                                                                                        |
| `Logo`                                                                                                            | The brand mark. Don't recolor, restyle or re-tilt.                                                                                                  |
| `AppHeader`                                                                                                       | Top bar of every app screen.                                                                                                                        |
| `CardPage` (`components/app`)                                                                                     | Focused single-task screens: sign-up, sign-in, password reset, onboarding. Calm: no playful type (§12).                                             |

Adding a component: build it from theme tokens only, add it to
`components/ui/index.ts`, show it on `/design`, and document it in this table.

## 8. Icons and imagery

- Line icons on a 24px grid, 2px stroke, round caps and joins, `currentColor`
  (`<Icon name=… />`). Add new icons in the same style.
- Put icons in an `IconChip` (tint background, deep-tone icon) when they
  introduce something; bare icons only inline next to text.
- **No emoji** in the UI. No stock photos of families. Product mockups and
  real household photos (the user's own) are the imagery.
- Icons that carry meaning without visible text need a `label`.

## 9. Motion

- 120ms for hovers and presses, 200ms for larger changes. Ease, no bounce.
- Allowed: button lift/press, subtle fades. Not allowed in the app: wiggles,
  spins, confetti, parallax, auto-playing animation.
- Respect `prefers-reduced-motion` (global reset plus component guards).

## 10. Voice and copy

- Friendly and plain, like a helpful neighbor. Short sentences, active voice.
- Say what happens: buttons are verbs ("Create household", "Email me a code").
- Warm is fine; silly isn't. One small joke per page at most, never in
  money, privacy or errors. At most one exclamation mark per screen.
- Errors say what went wrong and how to fix it. No blame, no "Oops!".
- **Privacy and product claims must be true.** Don't write "encrypted",
  "never sold", "ad-free" and the like unless the feature and the policy exist.
- Never show whether a private household or an account exists (same 404/401
  message for "private" and "not found"; sign-in never confirms an email).
- Use fictional names in examples and mockups. Never real people's data.

## 11. Accessibility

- Contrast per §3. Don't signal state by color alone (pair it with text or an icon).
- Visible focus on everything interactive (global 3px ring; don't remove it).
- Real elements: `button` for actions, `a`/`Link` for navigation, `label` for inputs.
- One `h1` per page; headings in order.
- Decorative mockups and illustrations get `aria-hidden`.
- Hit targets ≥ 44px; forms usable with keyboard only.

## 12. Context guide: how playful can this screen be?

| Context                                                | Fredoka accents     | Highlight    | Accent tints           | Tilt                     |
| ------------------------------------------------------ | ------------------- | ------------ | ---------------------- | ------------------------ |
| Marketing pages                                        | Yes                 | One per page | Yes                    | Hero stickers only (±2°) |
| Kids' features (chores, points)                        | Yes                 | Sparingly    | Yes                    | No                       |
| Everyday app (lists, calendar, chat, memories)         | Section labels only | No           | Icon chips, soft cards | No                       |
| Money, documents, inventory                            | **No**              | **No**       | Icon chips only        | No                       |
| Settings, permissions, privacy, account, legal, errors | **No**              | **No**       | Status colors only     | No                       |

## 13. Dark mode

Dark tokens exist (`darkTheme`) so components stay theme-agnostic, but the web
app ships **light only** for now. Before turning dark mode on: review every
screen in both themes, re-check contrast (§3), and confirm the outline/shadow
treatment still reads. Components must never branch on `theme.mode`; they use
semantic tokens.

## 14. Mobile (Expo, later)

- Same tokens from `@households/theme` (numbers are dp). Use `fontFamilies`
  (bare names) and load the three faces with `expo-font`.
- The hard shadow isn't possible with native shadows on Android: render it as an
  offset ink view behind the card, or drop to outline-only.
- Component names and variants should mirror the web ones.

## 15. Before you ship UI: checklist

- [ ] Built from `components/ui`; no one-off styling that duplicates a component.
- [ ] Colors and fonts only from the theme (lint passes).
- [ ] Context guide (§12) respected: no Fredoka/highlight/tilt on serious screens.
- [ ] One primary button per section; one highlight per view at most.
- [ ] Works at 390px and 1440px, keyboard-only, with visible focus.
- [ ] New pairings contrast-checked; state not conveyed by color alone.
- [ ] Copy is plain, true, and says what happens.
- [ ] New components are on `/design` and in §7.
