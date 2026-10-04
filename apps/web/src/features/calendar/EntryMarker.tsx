import type { CalendarEntry, CalendarEvent } from '@households/shared'
import type { Accent } from '@households/theme'
import styled from 'styled-components'

import { Icon } from '../../components/icons'
import { StatusDot } from '../../components/ui'
import { KIND_ICONS } from './entries'

/**
 * The mark in front of a calendar entry: the colour of each person an event
 * is for (an open ring when it's for everyone), or the icon of a list item,
 * chore or meal. Decorative: the text beside it says what it is.
 */
export function EntryMarker({
  entry,
  events,
  tones,
  size = 12,
}: {
  entry: CalendarEntry
  events: Map<string, CalendarEvent>
  tones: Map<string, Accent>
  size?: number
}) {
  if (entry.kind !== 'event') {
    return (
      <Mark aria-hidden="true" $size={size}>
        <Icon name={KIND_ICONS[entry.kind]} size={size} strokeWidth={2.5} />
      </Mark>
    )
  }
  const people = (events.get(entry.eventId)?.people ?? []).slice(0, 3)
  return (
    <Mark aria-hidden="true" $size={size}>
      {people.length === 0 ? (
        <Ring />
      ) : (
        people.map((id) => <StatusDot key={id} $tone={tones.get(id) ?? 'grape'} />)
      )}
    </Mark>
  )
}

const Mark = styled.span<{ $size: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 2px;
  min-width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  color: ${({ theme }) => theme.colors.textMuted};
`

/** For everyone: an open ring in the text colour. */
const Ring = styled.i`
  width: 8px;
  height: 8px;
  border: 1.5px solid ${({ theme }) => theme.colors.textMuted};
  border-radius: 50%;
`
