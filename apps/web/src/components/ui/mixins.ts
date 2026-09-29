import { css, type DefaultTheme } from 'styled-components'

/**
 * Style building blocks shared by the UI components. Pages should compose
 * components; reach for these only when building a new component.
 */

type ShadowSize = keyof DefaultTheme['shadowOffsets']

/** Hard offset shadow, the Playhouse depth effect. */
export const offsetShadow = (theme: DefaultTheme, size: ShadowSize = 'md') => {
  const n = theme.shadowOffsets[size]
  return `${n}px ${n}px 0 ${theme.colors.shadow}`
}

/** The signature object treatment: 2px outline + hard offset shadow. */
export const outlined = (size: ShadowSize = 'md') => css`
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  box-shadow: ${({ theme }) => offsetShadow(theme, size)};
`

export const container = css`
  width: 100%;
  max-width: ${({ theme }) => theme.layout.containerMax}px;
  margin-left: auto;
  margin-right: auto;
  padding-left: ${({ theme }) => theme.layout.gutter}px;
  padding-right: ${({ theme }) => theme.layout.gutter}px;
`

export const focusRing = css`
  outline: 3px solid ${({ theme }) => theme.colors.focusRing};
  outline-offset: 3px;
`

export const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

/** Lift on hover, press on click. Motion is skipped for reduced-motion users. */
export const pressable = (rest: ShadowSize = 'sm') => css`
  transition:
    transform ${({ theme }) => theme.durations.fast}ms ease,
    box-shadow ${({ theme }) => theme.durations.fast}ms ease,
    background ${({ theme }) => theme.durations.fast}ms ease;

  &:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: ${({ theme }) => offsetShadow(theme, rest === 'sm' ? 'md' : rest)};
  }

  &:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: ${({ theme }) => offsetShadow(theme, 'pressed')};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover:not(:disabled),
    &:active:not(:disabled) {
      transform: none;
    }
  }
`
