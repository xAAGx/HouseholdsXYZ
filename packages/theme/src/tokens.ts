/**
 * Households.xyz design tokens: "Playhouse · Balanced".
 *
 * Raw values only. UI code uses the semantic theme (./theme.ts) through
 * `props.theme`, never these constants directly. Read DESIGN.md at the repo
 * root before adding or changing a token.
 *
 * Sizes are unitless numbers (px on web, dp on React Native).
 */

export const palette = {
  // Neutrals
  cream: '#FFF8EC',
  creamDeep: '#FFF1DC',
  white: '#FFFFFF',
  ink: '#1F1B2E',
  inkSoft: '#5A5568',
  inkSubtle: '#8A8597',

  // Accents: base (graphic details), tint (areas), deep (icons/text on tints)
  yellow: '#FFD23F',
  yellowHover: '#FFC61A',
  yellowTint: '#FFF0C2',
  yellowDeep: '#8A6400',
  coral: '#FF6B57',
  coralTint: '#FFE3DD',
  coralDeep: '#B83A28',
  sky: '#53C7F0',
  skyTint: '#DDF3FC',
  skyDeep: '#146F93',
  grass: '#3DBE7A',
  grassTint: '#DDF5E7',
  grassDeep: '#1B7A48',
  grape: '#6A48F0',
  grapeTint: '#EAE4FF',
  grapeDeep: '#5234C9',

  // Dark mode neutrals
  night: '#15121E',
  nightRaised: '#201C2C',
  nightMuted: '#2A2538',
  nightLine: '#3B3550',
  nightShadow: '#0A0810',
  creamSoft: '#C9C2D6',
  creamSubtle: '#8E87A0',
} as const

export const accentNames = ['yellow', 'coral', 'sky', 'grass', 'grape'] as const
export type Accent = (typeof accentNames)[number]

/** 4-point spacing scale. Index → px. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 128,
} as const

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  pill: 999,
} as const

export const borderWidths = {
  hairline: 1,
  /** The signature Playhouse outline. */
  outline: 2,
} as const

/** Hard offset shadows (x = y, no blur): the Playhouse depth effect. */
export const shadowOffsets = {
  pressed: 1,
  sm: 3,
  md: 4,
} as const

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 44,
  '5xl': 52,
  '6xl': 74,
} as const

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const

export const lineHeights = {
  tight: 1.04,
  snug: 1.25,
  normal: 1.6,
} as const

export const letterSpacings = {
  display: '-0.035em',
  heading: '-0.03em',
  snug: '-0.015em',
  normal: '0',
  label: '0.1em',
} as const

export const breakpoints = {
  sm: 520,
  md: 800,
  lg: 980,
  xl: 1200,
} as const

export const layout = {
  containerMax: 1200,
  gutter: 24,
  sectionGap: 96,
  /** Minimum touch target. */
  hitTarget: 44,
} as const

export const durations = {
  fast: 120,
  base: 200,
} as const

/**
 * Typeface roles. Each has one job; see DESIGN.md → Typography.
 * `fonts` are CSS stacks for the web; `fontFamilies` are bare names for native.
 */
export const fontFamilies = {
  display: 'Bricolage Grotesque',
  body: 'Figtree',
  playful: 'Fredoka',
} as const

export const fonts = {
  display: "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif",
  body: "'Figtree Variable', 'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif",
  playful: "'Fredoka Variable', 'Fredoka', 'Trebuchet MS', sans-serif",
} as const

export function px(value: number): string {
  return `${value}px`
}
