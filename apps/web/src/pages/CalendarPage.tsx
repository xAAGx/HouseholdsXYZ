import { addDays, localDate, type CalendarEvent, type QuickEvent } from '@households/shared'
import { useMemo, useState } from 'react'
import styled from 'styled-components'

import { Icon } from '../components/icons'
import {
  Button,
  Card,
  CardTitle,
  ChipButton,
  ChipGroup,
  Grid,
  Muted,
  Page,
  PageTitle,
  Row,
  Stack,
  StatusDot,
  Text,
} from '../components/ui'
import {
  addMonths,
  formatLongDay,
  formatMonth,
  monthOf,
  monthWeeks,
} from '../features/calendar/dates'
import { DayAgenda } from '../features/calendar/DayAgenda'
import { entriesByDay, forPerson, KIND_ICONS, memberTones } from '../features/calendar/entries'
import { EventForm } from '../features/calendar/EventForm'
import { MonthGrid } from '../features/calendar/MonthGrid'
import { useCalendar, useCalendarActions } from '../features/calendar/queries'
import { QuickAdd } from '../features/calendar/QuickAdd'
import { Upcoming, UPCOMING_DAYS } from '../features/calendar/Upcoming'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import { memberNames, type MemberView } from '../features/households/member-view'
import { apiErrorMessage } from '../lib/api-errors'

/** /…/calendar: the household's month (or what's coming up), and what's on each day. */
export function CalendarPage() {
  return (
    <MemberGate subPath="/calendar">
      {(view, basePath) => <Calendar view={view} basePath={basePath} />}
    </MemberGate>
  )
}

type Editing =
  { kind: 'new'; draft: QuickEvent | null } | { kind: 'edit'; event: CalendarEvent } | null
type Mode = 'month' | 'upcoming'

const MODE_KEY = 'households.calendar-view'

// The view is a per-device preference (a phone may prefer the list).
function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'upcoming' ? 'upcoming' : 'month'
  } catch {
    return 'month'
  }
}

function saveMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Private browsing: just don't remember.
  }
}

const KIND_LEGEND = [
  { kind: 'due', label: 'Due on lists' },
  { kind: 'chore', label: 'Chores' },
  { kind: 'meal', label: 'Meals' },
] as const

function Calendar({ view, basePath }: { view: MemberView; basePath: string }) {
  const today = localDate()
  const [mode, setMode] = useState<Mode>(savedMode)
  const [month, setMonth] = useState(monthOf(today))
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<Editing>(null)
  const [person, setPerson] = useState<string | null>(null)

  const weeks = useMemo(() => monthWeeks(month), [month])
  const days = useMemo(
    () =>
      mode === 'month'
        ? weeks.flat()
        : Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(today, i)),
    [mode, weeks, today],
  )
  const calendar = useCalendar(view.household.id, days[0]!, days[days.length - 1]!)
  const actions = useCalendarActions(view.household.id)
  const me = view.members.find((member) => member.isMe)?.profileId ?? ''
  const names = memberNames(view)
  const tones = useMemo(() => memberTones(view.members), [view.members])

  const events = useMemo(
    () => new Map((calendar.data?.events ?? []).map((event) => [event.id, event])),
    [calendar.data],
  )
  const allByDay = useMemo(
    () => entriesByDay(calendar.data?.entries ?? [], days),
    [calendar.data, days],
  )
  const shown = useMemo(
    () => forPerson(calendar.data?.entries ?? [], events, person),
    [calendar.data, events, person],
  )
  const byDay = useMemo(() => entriesByDay(shown, days), [shown, days])

  const goTo = (next: string) => {
    setMonth(next)
    setSelected(next === monthOf(today) ? today : `${next}-01`)
  }
  const changeMode = (next: Mode) => {
    setMode(next)
    saveMode(next)
  }
  const edit = (event: CalendarEvent) => {
    setEditing({ kind: 'edit', event })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const save = editing?.kind === 'edit' ? actions.update : actions.create

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Stack $gap={1}>
            <PageTitle>Calendar</PageTitle>
            <Muted>{view.household.name}</Muted>
          </Stack>

          {editing ? (
            <Card $padding="lg">
              <Stack $gap={4}>
                <CardTitle>{editing.kind === 'edit' ? 'Edit event' : 'New event'}</CardTitle>
                <EventForm
                  key={editing.kind === 'edit' ? editing.event.id : `new-${selected}`}
                  event={editing.kind === 'edit' ? editing.event : null}
                  draft={editing.kind === 'new' ? editing.draft : null}
                  day={selected}
                  byDay={allByDay}
                  events={events}
                  members={view.members}
                  me={me}
                  busy={save.isPending}
                  error={save.error}
                  onCancel={() => setEditing(null)}
                  onSave={async (json) => {
                    if (editing.kind === 'edit') {
                      await actions.update.mutateAsync({ eventId: editing.event.id, json })
                    } else {
                      await actions.create.mutateAsync(json)
                    }
                    setSelected(json.startsOn)
                    setMonth(monthOf(json.startsOn))
                    setEditing(null)
                  }}
                />
              </Stack>
            </Card>
          ) : (
            calendar.data?.canAdd && (
              <Card $variant="soft" $tone="grape" $padding="lg">
                <QuickAdd
                  today={today}
                  members={view.members}
                  actions={actions}
                  onMore={(draft) => setEditing({ kind: 'new', draft })}
                />
              </Card>
            )
          )}

          {calendar.isError && (
            <Text>We couldn’t load the calendar. {apiErrorMessage(calendar.error)}</Text>
          )}

          <Toolbar>
            <ChipGroup label="View">
              <ChipButton pressed={mode === 'month'} onClick={() => changeMode('month')}>
                Month
              </ChipButton>
              <ChipButton pressed={mode === 'upcoming'} onClick={() => changeMode('upcoming')}>
                Upcoming
              </ChipButton>
            </ChipGroup>
            <ChipGroup label="Show">
              <ChipButton pressed={person === null} onClick={() => setPerson(null)}>
                Everyone
              </ChipButton>
              {view.members.map((member) => (
                <ChipButton
                  key={member.profileId}
                  pressed={person === member.profileId}
                  onClick={() => setPerson(person === member.profileId ? null : member.profileId)}
                >
                  <PersonDot aria-hidden="true">
                    <StatusDot $tone={tones.get(member.profileId) ?? 'grape'} />
                  </PersonDot>
                  {member.isMe ? 'Me' : member.displayName.split(' ')[0]}
                </ChipButton>
              ))}
            </ChipGroup>
          </Toolbar>

          {mode === 'upcoming' ? (
            <Card $padding="lg">
              {calendar.isPending ? (
                <Muted>Loading…</Muted>
              ) : (
                <Upcoming
                  today={today}
                  entries={shown}
                  events={events}
                  names={names}
                  tones={tones}
                  basePath={basePath}
                  actions={actions}
                  onEdit={edit}
                />
              )}
            </Card>
          ) : (
            <TopAligned $columns={2} $gap={5}>
              <Card $padding="lg">
                <Stack $gap={4}>
                  <Row $justify="between">
                    <CardTitle as="h2">{formatMonth(month)}</CardTitle>
                    <Row $gap={1}>
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        aria-label="Previous month"
                        onClick={() => goTo(addMonths(month, -1))}
                      >
                        <Icon name="chevronLeft" size={18} />
                      </Button>
                      {month !== monthOf(today) && (
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          onClick={() => goTo(monthOf(today))}
                        >
                          Today
                        </Button>
                      )}
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        aria-label="Next month"
                        onClick={() => goTo(addMonths(month, 1))}
                      >
                        <Icon name="chevronRight" size={18} />
                      </Button>
                    </Row>
                  </Row>
                  <MonthGrid
                    month={month}
                    weeks={weeks}
                    today={today}
                    selected={selected}
                    byDay={byDay}
                    events={events}
                    tones={tones}
                    onSelect={setSelected}
                  />
                  <Row $gap={4}>
                    {KIND_LEGEND.map((item) => (
                      <Key key={item.kind}>
                        <Icon name={KIND_ICONS[item.kind]} size={14} strokeWidth={2.5} />
                        <Muted as="span">{item.label}</Muted>
                      </Key>
                    ))}
                  </Row>
                </Stack>
              </Card>

              <Card $padding="lg">
                <Stack $gap={4}>
                  <CardTitle as="h2">
                    {selected === today
                      ? `Today, ${formatLongDay(selected)}`
                      : formatLongDay(selected)}
                  </CardTitle>
                  {calendar.isPending ? (
                    <Muted>Loading…</Muted>
                  ) : (
                    <DayAgenda
                      entries={byDay.get(selected) ?? []}
                      events={events}
                      names={names}
                      tones={tones}
                      basePath={basePath}
                      actions={actions}
                      onEdit={edit}
                    />
                  )}
                </Stack>
              </Card>
            </TopAligned>
          )}
        </Stack>
      </Page>
    </>
  )
}

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[5]}px;
`

const PersonDot = styled.span`
  display: inline-flex;
  margin-right: ${({ theme }) => theme.space[1]}px;
`

const TopAligned = styled(Grid)`
  align-items: start;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const Key = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`
