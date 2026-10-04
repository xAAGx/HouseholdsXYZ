import {
  localDate,
  MEAL_SLOT_LABELS,
  type CalendarEntry,
  type CalendarEvent,
  type HouseholdMember,
} from '@households/shared'
import { useMemo } from 'react'
import styled from 'styled-components'

import { ButtonLink, Card, CardList, CardTitle, Muted, Row, Stack } from '../../components/ui'
import { formatClock, formatLongDay } from '../calendar/dates'
import { memberTones, sortEntries } from '../calendar/entries'
import { EntryMarker } from '../calendar/EntryMarker'
import { useCalendar } from '../calendar/queries'

function describe(
  entry: CalendarEntry,
  events: Map<string, CalendarEvent>,
  names: Map<string, string>,
): { title: string; detail: string } {
  switch (entry.kind) {
    case 'event': {
      const event = events.get(entry.eventId)
      const time = event?.startTime
        ? event.endTime
          ? `${formatClock(event.startTime)}–${formatClock(event.endTime)}`
          : formatClock(event.startTime)
        : 'All day'
      const who = (event?.people ?? []).map((id) => names.get(id)).filter(Boolean)
      return {
        title: event?.title ?? 'Event',
        detail: who.length > 0 ? `${time} · for ${who.join(', ')}` : time,
      }
    }
    case 'meal':
      return { title: entry.title, detail: MEAL_SLOT_LABELS[entry.slot] }
    case 'due':
      return { title: entry.text, detail: `Due on ${entry.listTitle}` }
    case 'chore':
      return { title: entry.title, detail: 'Chore due' }
  }
}

const MAX_SHOWN = 8

/** The household home's "Today": events, meals and what's due, in one place. */
export function TodayOverview({
  householdId,
  members,
}: {
  householdId: string
  members: HouseholdMember[]
}) {
  const today = localDate()
  const calendar = useCalendar(householdId, today, today)
  const tones = useMemo(() => memberTones(members), [members])
  const names = new Map(members.map((member) => [member.profileId, member.displayName]))
  const events = new Map((calendar.data?.events ?? []).map((event) => [event.id, event]))
  // Only what's on today (a trip that started earlier counts), at most a screenful.
  const all = sortEntries(
    (calendar.data?.entries ?? []).filter(
      (entry) =>
        entry.date <= today && (entry.kind === 'event' ? entry.endDate : entry.date) >= today,
    ),
    events,
  )
  const entries = all.slice(0, MAX_SHOWN)

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Row $justify="between">
          <Stack $gap={1}>
            <CardTitle as="h2">Today</CardTitle>
            <Muted>{formatLongDay(today)}</Muted>
          </Stack>
          <ButtonLink to="calendar" relative="path" $variant="ghost" $size="sm">
            Open the calendar
          </ButtonLink>
        </Row>
        {calendar.isPending && <Muted>Loading…</Muted>}
        {calendar.data && entries.length === 0 && <Muted>Nothing on the calendar today.</Muted>}
        {entries.length > 0 && (
          <List>
            {entries.map((entry) => {
              const { title, detail } = describe(entry, events, names)
              return (
                <li key={entry.key}>
                  <Line>
                    <Marker>
                      <EntryMarker entry={entry} events={events} tones={tones} size={14} />
                    </Marker>
                    <Stack $gap={1}>
                      <Title>{title}</Title>
                      <Muted>{detail}</Muted>
                    </Stack>
                  </Line>
                </li>
              )
            })}
          </List>
        )}
        {all.length > entries.length && (
          <Muted>And {all.length - entries.length} more in the calendar.</Muted>
        )}
      </Stack>
    </Card>
  )
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
