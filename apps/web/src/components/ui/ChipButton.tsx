import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styled from 'styled-components'

import { focusRing } from './mixins'

interface ChipButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  pressed: boolean
  children: ReactNode
}

/**
 * A Chip you can switch on and off: weekdays, people taking turns, filters.
 * Looks like Chip; is a toggle button (aria-pressed) for keyboards and
 * screen readers.
 */
export function ChipButton({ pressed, children, ...buttonProps }: ChipButtonProps) {
  return (
    <Toggle type="button" aria-pressed={pressed} $pressed={pressed} {...buttonProps}>
      {children}
    </Toggle>
  )
}

const Toggle = styled.button<{ $pressed: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 6px 13px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme, $pressed }) => ($pressed ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $pressed }) => ($pressed ? theme.colors.onPrimary : theme.colors.text)};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  cursor: pointer;

  &:focus-visible {
    ${focusRing};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`
