import {
  borderWidths,
  breakpoints,
  durations,
  fonts,
  fontFamilies,
  fontSizes,
  fontWeights,
  layout,
  letterSpacings,
  lineHeights,
  palette,
  radii,
  shadowOffsets,
  space,
  type Accent,
} from './tokens'

export interface AccentSet {
  /** Small graphic details only (dots, stars, a checked tick). Never text. */
  base: string
  /** Backgrounds of areas: soft cards, icon chips, tinted sections. */
  tint: string
  /** Icons and short text placed on the tint. */
  deep: string
}

/** Semantic colors. Components pick colors by role, never by hue. */
export interface ThemeColors {
  /** Page background. */
  background: string
  /** Cards, inputs, menus. */
  surface: string
  /** Subtle fills inside surfaces (hover rows, table stripes). */
  surfaceMuted: string
  /** Dark bands, footer, the featured plan. */
  inverse: string
  onInverse: string
  onInverseMuted: string
  text: string
  textMuted: string
  /** Placeholders and disabled text. Never for information users need. */
  textSubtle: string
  /** The 2px signature outline. */
  outline: string
  /** Color of the hard offset shadow. */
  shadow: string
  /** Dividers inside cards and lists. */
  hairline: string
  /** Main action, highlights, the selected choice. */
  primary: string
  primaryHover: string
  onPrimary: string
  focusRing: string
  danger: string
  dangerSurface: string
  success: string
  successSurface: string
  warning: string
  warningSurface: string
  /** Section eyebrows ("FEATURES"). */
  eyebrow: string
  accents: Record<Accent, AccentSet>
}

export interface AppTheme {
  mode: 'light' | 'dark'
  colors: ThemeColors
  space: typeof space
  radii: typeof radii
  borderWidths: typeof borderWidths
  shadowOffsets: typeof shadowOffsets
  fontSizes: typeof fontSizes
  fontWeights: typeof fontWeights
  lineHeights: typeof lineHeights
  letterSpacings: typeof letterSpacings
  breakpoints: typeof breakpoints
  layout: typeof layout
  durations: typeof durations
  fonts: typeof fonts
  fontFamilies: typeof fontFamilies
}

const base = {
  space,
  radii,
  borderWidths,
  shadowOffsets,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,
  breakpoints,
  layout,
  durations,
  fonts,
  fontFamilies,
} as const

export const lightTheme: AppTheme = {
  ...base,
  mode: 'light',
  colors: {
    background: palette.cream,
    surface: palette.white,
    surfaceMuted: palette.creamDeep,
    inverse: palette.ink,
    onInverse: palette.cream,
    onInverseMuted: 'rgba(255, 248, 236, 0.78)',
    text: palette.ink,
    textMuted: palette.inkSoft,
    textSubtle: palette.inkSubtle,
    outline: palette.ink,
    shadow: palette.ink,
    hairline: 'rgba(31, 27, 46, 0.12)',
    primary: palette.yellow,
    primaryHover: palette.yellowHover,
    onPrimary: palette.ink,
    focusRing: palette.ink,
    danger: palette.coralDeep,
    dangerSurface: palette.coralTint,
    success: palette.grassDeep,
    successSurface: palette.grassTint,
    warning: palette.yellowDeep,
    warningSurface: palette.yellowTint,
    eyebrow: palette.coralDeep,
    accents: {
      yellow: { base: palette.yellow, tint: palette.yellowTint, deep: palette.yellowDeep },
      coral: { base: palette.coral, tint: palette.coralTint, deep: palette.coralDeep },
      sky: { base: palette.sky, tint: palette.skyTint, deep: palette.skyDeep },
      grass: { base: palette.grass, tint: palette.grassTint, deep: palette.grassDeep },
      grape: { base: palette.grape, tint: palette.grapeTint, deep: palette.grapeDeep },
    },
  },
}

/**
 * Dark mode tokens. Defined so components stay theme-agnostic, but not yet
 * enabled in the web app: see DESIGN.md → Dark mode before switching it on.
 */
export const darkTheme: AppTheme = {
  ...base,
  mode: 'dark',
  colors: {
    background: palette.night,
    surface: palette.nightRaised,
    surfaceMuted: palette.nightMuted,
    inverse: palette.cream,
    onInverse: palette.ink,
    onInverseMuted: 'rgba(31, 27, 46, 0.75)',
    text: palette.cream,
    textMuted: palette.creamSoft,
    textSubtle: palette.creamSubtle,
    outline: palette.nightLine,
    shadow: palette.nightShadow,
    hairline: 'rgba(255, 248, 236, 0.12)',
    primary: palette.yellow,
    primaryHover: palette.yellowHover,
    onPrimary: palette.ink,
    focusRing: palette.yellow,
    danger: '#FF8C7A',
    dangerSurface: '#3D2420',
    success: '#6BD49B',
    successSurface: '#173325',
    warning: palette.yellow,
    warningSurface: '#3A3218',
    eyebrow: palette.yellow,
    accents: {
      yellow: { base: palette.yellow, tint: '#3A3218', deep: palette.yellow },
      coral: { base: palette.coral, tint: '#3D2420', deep: '#FF8C7A' },
      sky: { base: palette.sky, tint: '#15313D', deep: '#7DD6F4' },
      grass: { base: palette.grass, tint: '#173325', deep: '#6BD49B' },
      grape: { base: palette.grape, tint: '#2A2150', deep: '#A898FF' },
    },
  },
}

/** `${mq.lg}` → `@media (max-width: 980px)`. Desktop-first, matching our layouts. */
export const mq = Object.fromEntries(
  Object.entries(breakpoints).map(([key, value]) => [key, `@media (max-width: ${value}px)`]),
) as Record<keyof typeof breakpoints, string>
