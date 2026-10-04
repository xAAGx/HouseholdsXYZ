import { addDays, daysBetween, type CalendarEntry, type CalendarEvent } from '@households/shared'
import type { Accent } from '@households/theme'
import styled from 'styled-components'

import { Muted, Stack } from '../../components/ui'
import { formatLongDay } from './dates'
import { DayAgenda } from './DayAgenda'
import { entriesByDay } from './entries'
import type { CalendarActions } from './queries'

/** How far ahead "Upcoming" looks. */
export const UPCOMING_DAYS = 28

function heading(day: string, today: string): { title: string; note: string | null } {
  const gap = daysBetween(today, day)
  if (gap === 0) return { title: `Today, ${formatLongDay(day)}`, note: null }
  if (gap === 1) return { title: `Tomorrow, ${formatLongDay(day)}`, note: null }
  return { title: formatLongDay(day), note: `in ${gap} days` }
}

/** The next four weeks as a list, day by day: easier than a grid on a phone. */
export function Upcoming({
  today,
  entries,
  events,
  names,
  tones,
  basePath,
  actions,
  onEdit,
}: {
  today: string
  entries: CalendarEntry[]
  events: Map<string, CalendarEvent>
  names: Map<string, string>
  tones: Map<string, Accent>
  basePath: string
  actions: CalendarActions
  onEdit: (event: CalendarEvent) => void
}) {
  const days = Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(today, i))
  const byDay = entriesByDay(entries, days)
  const busy = days.filter((day) => (byDay.get(day)?.length ?? 0) > 0)

  if (busy.length === 0) return <Muted>Nothing in the next four weeks.</Muted>

  return (
    <Stack $gap={6}>
      {busy.map((day) => {
        const { title, note } = heading(day, today)
        return (
          <section key={day} aria-label={title}>
            <Stack $gap={3}>
              <Heading>
                {title}
                {note && <Muted as="span"> · {note}</Muted>}
              </Heading>
              <DayAgenda
                entries={byDay.get(day) ?? []}
                events={events}
                names={names}
                tones={tones}
                basePath={basePath}
                actions={actions}
                onEdit={onEdit}
              />
            </Stack>
          </section>
        )
      })}
    </Stack>
  )
}

const Heading = styled.h3`
  padding-bottom: ${({ theme }) => theme.space[2]}px;
  border-bottom: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  font-size: ${({ theme }) => theme.fontSizes.md}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`
