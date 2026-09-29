import type { Accent } from '@households/theme'
import styled from 'styled-components'

/** Static label with an outline, e.g. "Private by default". Optional status dot. */
export const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: 4px 12px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`

/** Small colored dot for a Pill. Color comes from an accent, never a raw value. */
export const StatusDot = styled.i<{ $tone?: Accent }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $tone = 'grass' }) => theme.colors.accents[$tone].base};
`

/** A selectable option (audiences, filters). Selected = primary fill. */
export const Chip = styled.span<{ $selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 6px 13px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $selected }) => ($selected ? theme.colors.onPrimary : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`

/** Playful count badge: points, streaks. Kids' contexts only. */
export const PointsBadge = styled.b`
  display: inline-flex;
  padding: 1px 8px;
  border: 1.5px solid ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onPrimary};
  font-family: ${({ theme }) => theme.fonts.playful};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 13px;
`

/** Name tag: a person's role or group in a playful label ("Kids", "Teens"). */
export const NameTag = styled.span`
  display: inline-block;
  padding: 3px 12px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.playful};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 17px;
`

/** Status text for money and tasks: "Paid", "Due Fri", "Overdue". */
export const StatusText = styled.small<{ $status: 'success' | 'warning' | 'danger' }>`
  font-size: 12.5px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme, $status }) => theme.colors[$status]};
`
