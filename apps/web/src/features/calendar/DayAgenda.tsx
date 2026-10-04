import {
  deviceTimeZone,
  EVENT_REPEAT_LABELS,
  MEAL_SLOT_LABELS,
  type CalendarEntry,
  type CalendarEvent,
} from '@households/shared'
import type { Accent } from '@households/theme'
import { Link } from 'react-router'
import styled from 'styled-components'

import { Button, CardList, ConfirmButton, ErrorText, Muted, Row, Stack } from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import { formatClock, zoneCity } from './dates'
import { downloadEventIcs } from './download'
import { sortEntries } from './entries'
import { EntryMarker } from './EntryMarker'
import type { CalendarActions } from './queries'

function when(event: CalendarEvent, date: string, endDate: string): string {
  const parts: string[] = []
  if (event.startTime) {
    parts.push(
      event.endTime
        ? `${formatClock(event.startTime)}–${formatClock(event.endTime)}`
        : formatClock(event.startTime),
    )
  } else {
    parts.push('All day')
  }
  if (endDate !== date) parts.push(`until ${formatDay(endDate)}`)
  if (event.repeat !== 'none') parts.push(EVENT_REPEAT_LABELS[event.repeat].toLowerCase())
  if (event.startTime && event.timeZone !== deviceTimeZone()) {
    parts.push(`${zoneCity(event.timeZone)} time`)
  }
  return parts.join(' · ')
}

/** What's on one day, with actions for events you can change. */
export function DayAgenda({
  entries,
  events,
  names,
  tones,
  basePath,
  actions,
  onEdit,
}: {
  entries: CalendarEntry[]
  events: Map<string, CalendarEvent>
  names: Map<string, string>
  tones: Map<string, Accent>
  basePath: string
  actions: CalendarActions
  onEdit: (event: CalendarEvent) => void
}) {
  const failed = actions.skip.error ?? actions.remove.error
  if (entries.length === 0) return <Muted>Nothing planned.</Muted>

  return (
    <Stack $gap={3}>
      <List>
        {sortEntries(entries, events).map((entry) => (
          <li key={entry.key}>
            <Line>
              <Marker>
                <EntryMarker entry={entry} events={events} tones={tones} size={14} />
              </Marker>
              <Stack $gap={1}>
                <EntryContent
                  entry={entry}
                  events={events}
                  names={names}
                  basePath={basePath}
                  actions={actions}
                  onEdit={onEdit}
                />
              </Stack>
            </Line>
          </li>
        ))}
      </List>
      {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
    </Stack>
  )
}

function EntryContent({
  entry,
  events,
  names,
  basePath,
  actions,
  onEdit,
}: {
  entry: CalendarEntry
  events: Map<string, CalendarEvent>
  names: Map<string, string>
  basePath: string
  actions: CalendarActions
  onEdit: (event: CalendarEvent) => void
}) {
  switch (entry.kind) {
    case 'event': {
      const event = events.get(entry.eventId)
      if (!event) return null
      const people = event.people.map((id) => names.get(id)).filter(Boolean)
      return (
        <>
          <Title>{event.title}</Title>
          <Muted>{when(event, entry.date, entry.endDate)}</Muted>
          {event.location && <Muted>{event.location}</Muted>}
          {people.length > 0 && <Muted>For {people.join(', ')}</Muted>}
          {event.notes && <Notes>{event.notes}</Notes>}
          <Row $gap={1}>
            {event.canEdit && (
              <Button type="button" $variant="ghost" $size="sm" onClick={() => onEdit(event)}>
                Edit
              </Button>
            )}
            <Button
              type="button"
              $variant="ghost"
              $size="sm"
              onClick={() => downloadEventIcs(event)}
            >
              Add to my calendar
            </Button>
            {event.canEdit && (
              <>
                {event.repeat !== 'none' && (
                  <Button
                    type="button"
                    $variant="ghost"
                    $size="sm"
                    disabled={actions.skip.isPending}
                    onClick={() => actions.skip.mutate({ eventId: event.id, date: entry.date })}
                  >
                    Skip this one
                  </Button>
                )}
                <ConfirmButton
                  message={
                    event.repeat === 'none'
                      ? `Delete “${event.title}”?`
                      : `Delete “${event.title}” and every repeat? To cancel just this one, skip it instead.`
                  }
                  confirmLabel="Yes, delete it"
                  busy={actions.remove.isPending}
                  onConfirm={() => actions.remove.mutate(event.id)}
                >
                  Delete
                </ConfirmButton>
              </>
            )}
          </Row>
        </>
      )
    }
    case 'due':
      return (
        <>
          <Title>{entry.text}</Title>
          <Muted>
            Due on <Link to={`${basePath}/lists/${entry.listId}`}>{entry.listTitle}</Link>
            {entry.assignedTo && ` · for ${names.get(entry.assignedTo) ?? 'someone'}`}
          </Muted>
        </>
      )
    case 'chore':
      return (
        <>
          <Title>{entry.title}</Title>
          <Muted>
            <Link to={`${basePath}/chores`}>Chore</Link> due
            {entry.assignedTo && ` · for ${names.get(entry.assignedTo) ?? 'someone'}`}
          </Muted>
        </>
      )
    case 'meal':
      return (
        <>
          <Title>{entry.title}</Title>
          <Muted>
            <Link to={`${basePath}/meals`}>{MEAL_SLOT_LABELS[entry.slot]}</Link>
          </Muted>
        </>
      )
  }
}

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const Line = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Marker = styled.span`
  display: grid;
  place-items: center;
  flex-shrink: 0;
  height: 24px;
`

const Title = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const Notes = styled.p`
  white-space: pre-line;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`
