import type { Accent } from '@households/theme'
import styled, { css } from 'styled-components'

import { outlined } from './mixins'

/**
 * outlined → a primary object users act on (a plan, a feature group, a form).
 *            The Playhouse signature: 2px outline + offset shadow.
 * soft     → a secondary grouping on an accent tint. No outline.
 * plain    → dense app content (lists, settings). Hairline border, no shadow.
 * inverse  → dark card for the one featured item in a set.
 */
export type CardVariant = 'outlined' | 'soft' | 'plain' | 'inverse'

export interface CardProps {
  $variant?: CardVariant
  /** Accent tint for `soft` cards. */
  $tone?: Accent
  $padding?: 'sm' | 'md' | 'lg'
}

const paddings = { sm: 16, md: 24, lg: 32 }

export const Card = styled.div<CardProps>`
  position: relative;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  padding: ${({ $padding = 'md' }) => paddings[$padding]}px;
  min-width: 0;

  ${({ $variant = 'outlined', $tone = 'yellow', theme }) => {
    switch ($variant) {
      case 'outlined':
        return css`
          background: ${theme.colors.surface};
          ${outlined('md')};
        `
      case 'soft':
        return css`
          background: ${theme.colors.accents[$tone].tint};
        `
      case 'plain':
        return css`
          background: ${theme.colors.surface};
          border: ${theme.borderWidths.hairline}px solid ${theme.colors.hairline};
        `
      case 'inverse':
        return css`
          background: ${theme.colors.inverse};
          color: ${theme.colors.onInverse};
          ${outlined('md')};
        `
    }
  }}
`

/** Rows inside a card, separated by hairlines. */
export const CardList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;

  > li {
    padding: ${({ theme }) => theme.space[4]}px 0;
    border-top: ${({ theme }) => theme.borderWidths.hairline}px solid
      ${({ theme }) => theme.colors.hairline};
  }
`
