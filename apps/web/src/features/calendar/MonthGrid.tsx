import { WEEKDAY_LABELS, type CalendarEntry, type CalendarEvent } from '@households/shared'
import type { Accent } from '@households/theme'
import styled, { css } from 'styled-components'

import { focusRing, visuallyHidden } from '../../components/ui/mixins'
import { formatLongDay, monthOf } from './dates'
import { entryLabel, sortEntries } from './entries'
import { EntryMarker } from './EntryMarker'

/**
 * A month, Monday first. Each day is a button that picks it; wide screens
 * show the first few things on it, phones a dot for each.
 */
export function MonthGrid({
  month,
  weeks,
  today,
  selected,
  byDay,
  events,
  tones,
  onSelect,
}: {
  month: string
  weeks: string[][]
  today: string
  selected: string
  byDay: Map<string, CalendarEntry[]>
  events: Map<string, CalendarEvent>
  tones: Map<string, Accent>
  onSelect: (day: string) => void
}) {
  return (
    <Grid>
      {WEEKDAY_LABELS.map((weekday) => (
        <Weekday key={weekday.day} aria-hidden="true">
          {weekday.short}
        </Weekday>
      ))}
      {weeks.flat().map((day) => {
        const entries = sortEntries(byDay.get(day) ?? [], events)
        const outside = monthOf(day) !== month
        return (
          <Day
            key={day}
            type="button"
            aria-pressed={day === selected}
            $selected={day === selected}
            $outside={outside}
            onClick={() => onSelect(day)}
          >
            <Hidden>
              {formatLongDay(day)}
              {day === today && ', today'}
              {entries.length > 0 &&
                `, ${entries.length} ${entries.length === 1 ? 'thing' : 'things'}`}
            </Hidden>
            <DayNumber aria-hidden="true" $today={day === today}>
              {Number.parseInt(day.slice(8), 10)}
            </DayNumber>
            <Lines aria-hidden="true">
              {entries.slice(0, 3).map((entry) => (
                <Line key={entry.key}>
                  <EntryMarker entry={entry} events={events} tones={tones} size={11} />
                  <span>{entryLabel(entry, events)}</span>
                </Line>
              ))}
              {entries.length > 3 && <More>+{entries.length - 3} more</More>}
            </Lines>
            <Dots aria-hidden="true">
              {entries.slice(0, 3).map((entry) => (
                <EntryMarker key={entry.key} entry={entry} events={events} tones={tones} size={9} />
              ))}
            </Dots>
          </Day>
        )
      })}
    </Grid>
  )
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[1]}px;
`

const Weekday = styled.span`
  padding-bottom: ${({ theme }) => theme.space[1]}px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.xs}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textMuted};
`

const Day = styled.button<{ $selected: boolean; $outside: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${({ theme }) => theme.space[1]}px;
  min-width: 0;
  min-height: 96px;
  padding: ${({ theme }) => theme.space[1]}px;
  border: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme }) => theme.colors.hairline};
  border-radius: ${({ theme }) => theme.radii.sm}px;
  background: ${({ theme, $outside }) => ($outside ? 'transparent' : theme.colors.surface)};
  color: ${({ theme, $outside }) => ($outside ? theme.colors.textSubtle : theme.colors.text)};
  font-family: ${({ theme }) => theme.fonts.body};
  text-align: left;
  cursor: pointer;

  ${({ $selected, theme }) =>
    $selected &&
    css`
      border: ${theme.borderWidths.outline}px solid ${theme.colors.outline};
      padding: ${theme.space[1] - 1}px;
    `}

  &:focus-visible {
    ${focusRing};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    min-height: 52px;
    align-items: center;
  }
`

const DayNumber = styled.span<{ $today: boolean }>`
  display: inline-grid;
  place-items: center;
  align-self: flex-start;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};

  ${({ $today, theme }) =>
    $today &&
    css`
      background: ${theme.colors.primary};
      color: ${theme.colors.onPrimary};
    `}

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    align-self: center;
  }
`

const Lines = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: none;
  }
`

const Line = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  min-width: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs}px;
  line-height: 1.3;

  > i {
    flex-shrink: 0;
  }

  > span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
`

const More = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs}px;
  color: ${({ theme }) => theme.colors.textMuted};
`

const Dots = styled.span`
  display: none;
  gap: 3px;
  justify-content: center;
  flex-wrap: wrap;

  i {
    width: 6px;
    height: 6px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: flex;
  }
`

const Hidden = styled.span`
  ${visuallyHidden};
`
