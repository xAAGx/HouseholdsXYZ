import type { Accent } from '@households/theme'
import styled from 'styled-components'

/**
 * A line icon on a soft accent tile. The standard way to show a feature,
 * category or document type. Size: 32 (inline), 44 (lists), 56 (feature).
 */
export const IconChip = styled.span<{ $tone: Accent; $size?: 32 | 36 | 44 | 56 }>`
  flex: none;
  display: grid;
  place-items: center;
  width: ${({ $size = 44 }) => $size}px;
  height: ${({ $size = 44 }) => $size}px;
  border-radius: ${({ $size = 44 }) => Math.round($size * 0.32)}px;
  background: ${({ theme, $tone }) => theme.colors.accents[$tone].tint};
  color: ${({ theme, $tone }) => theme.colors.accents[$tone].deep};
`
