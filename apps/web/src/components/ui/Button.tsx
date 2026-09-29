import { Link } from 'react-router'
import styled, { css } from 'styled-components'

import { offsetShadow, pressable } from './mixins'

/**
 * primary   → the one main action in a view (yellow). Max one per section.
 * secondary → other actions (white, outlined).
 * ghost     → low-emphasis actions inside cards and toolbars.
 * inverse   → primary action placed on a dark (inverse) band.
 * danger    → destructive actions (delete, remove member). Always confirm first.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonStyleProps {
  $variant?: ButtonVariant
  $size?: ButtonSize
  $fullWidth?: boolean
}

const sizes = {
  sm: css`
    min-height: 36px;
    padding: 0 14px;
    font-size: ${({ theme }) => theme.fontSizes.sm}px;
  `,
  md: css`
    min-height: ${({ theme }) => theme.layout.hitTarget}px;
    padding: 0 18px;
    font-size: 15px;
  `,
  lg: css`
    min-height: 52px;
    padding: 0 24px;
    font-size: 17px;
  `,
}

const variants = {
  primary: css`
    background: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.onPrimary};
    border-color: ${({ theme }) => theme.colors.outline};
    box-shadow: ${({ theme }) => offsetShadow(theme, 'sm')};
    ${pressable('sm')};

    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.colors.primaryHover};
    }
  `,
  secondary: css`
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.outline};
    box-shadow: ${({ theme }) => offsetShadow(theme, 'sm')};
    ${pressable('sm')};
  `,
  ghost: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.text};
    border-color: transparent;

    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.colors.surfaceMuted};
    }
  `,
  inverse: css`
    background: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.onPrimary};
    border-color: ${({ theme }) => theme.colors.onInverse};
    box-shadow: ${({ theme }) =>
      `${theme.shadowOffsets.sm}px ${theme.shadowOffsets.sm}px 0 ${theme.colors.onInverse}`};
  `,
  danger: css`
    background: ${({ theme }) => theme.colors.dangerSurface};
    color: ${({ theme }) => theme.colors.danger};
    border-color: ${({ theme }) => theme.colors.danger};
  `,
}

const buttonStyles = css<ButtonStyleProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]}px;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  border: ${({ theme }) => theme.borderWidths.outline}px solid transparent;
  border-radius: ${({ theme }) => theme.radii.md}px;
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;

  ${({ $size = 'md' }) => sizes[$size]};
  ${({ $variant = 'primary' }) => variants[$variant]};

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`

/** A <button>. Defaults to type="button" so it never submits a form by accident. */
export const Button = styled.button.attrs<ButtonStyleProps>(({ type }) => ({
  type: type ?? 'button',
}))<ButtonStyleProps>`
  ${buttonStyles}
`

/** A button-looking link to another page of the app. */
export const ButtonLink = styled(Link)<ButtonStyleProps>`
  ${buttonStyles}
`

/** A button-looking link to an anchor on the same page. */
export const ButtonAnchor = styled.a<ButtonStyleProps>`
  ${buttonStyles}
`
