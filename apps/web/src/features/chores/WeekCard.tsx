import {
  addDays,
  chorePeriodStart,
  isChoreOn,
  WEEKDAY_LABELS,
  type ChoreBoard,
  type ChoreCompletion,
} from '@households/shared'
import styled, { css } from 'styled-components'

import { Card, CardTitle, Muted, Row, Stack } from '../../components/ui'
import { visuallyHidden } from '../../components/ui/mixins'

type BoardChore = ChoreBoard['chores'][number]
type DayState = 'done' | 'waiting' | 'notDone' | 'toDo' | 'off'

const STATE_LABELS: Record<DayState, string> = {
  done: 'Done',
  waiting: 'Waiting for approval',
  notDone: 'Not done',
  toDo: 'To do',
  off: 'Not on',
}

const LEGEND: DayState[] = ['done', 'waiting', 'notDone', 'toDo']

/** Best completion for a day: approved, then waiting, then sent back. */
function completionOn(board: ChoreBoard, chore: BoardChore, day: string): ChoreCompletion | null {
  const rank = { approved: 0, pending: 1, rejected: 2 } as const
  return (
    board.recent
      .filter((completion) => completion.choreId === chore.id && completion.periodStart === day)
      .sort((a, b) => rank[a.status] - rank[b.status])[0] ?? null
  )
}

function stateOn(board: ChoreBoard, chore: BoardChore, day: string): DayState {
  if (day < chore.createdOn || !isChoreOn(chore, day)) return 'off'
  const completion = completionOn(board, chore, day)
  if (completion?.status === 'approved') return 'done'
  if (completion?.status === 'pending') return 'waiting'
  return day < board.today ? 'notDone' : 'toDo'
}

/**
 * This week's daily chores, Monday to Sunday, like a sticker chart: what got
 * done, what's waiting and what was missed.
 */
export function WeekCard({ board }: { board: ChoreBoard }) {
  const daily = board.chores.filter((chore) => !chore.archived && chore.repeat === 'daily')
  if (daily.length === 0) return null

  const monday = chorePeriodStart('weekly', board.today, board.today)
  const days = WEEKDAY_LABELS.map((weekday, index) => ({
    ...weekday,
    date: addDays(monday, index),
  }))

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <CardTitle>This week</CardTitle>
        <Table>
          <Hidden as="caption">Daily chores this week</Hidden>
          <thead>
            <tr>
              <th scope="col">
                <Hidden>Chore</Hidden>
              </th>
              {days.map((day) => (
                <DayHead key={day.day} scope="col" $today={day.date === board.today}>
                  <abbr title={day.long}>{day.short.slice(0, 1)}</abbr>
                </DayHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map((chore) => (
              <tr key={chore.id}>
                <ChoreName scope="row">{chore.title}</ChoreName>
                {days.map((day) => {
                  const state = stateOn(board, chore, day.date)
                  return (
                    <Cell key={day.day}>
                      <Mark $state={state} aria-hidden="true" />
                      <Hidden>
                        {day.long}: {STATE_LABELS[state]}
                      </Hidden>
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </Table>
        <Row $gap={4} aria-hidden="true">
          {LEGEND.map((state) => (
            <Key key={state}>
              <Mark $state={state} />
              <Muted as="span">{STATE_LABELS[state]}</Muted>
            </Key>
          ))}
        </Row>
      </Stack>
    </Card>
  )
}

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  tbody tr + tr {
    border-top: ${({ theme }) => theme.borderWidths.hairline}px solid
      ${({ theme }) => theme.colors.hairline};
  }
`

const DayHead = styled.th<{ $today: boolean }>`
  width: 24px;
  padding-bottom: ${({ theme }) => theme.space[2]}px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme, $today }) =>
    $today ? theme.fontWeights.bold : theme.fontWeights.semibold};
  color: ${({ theme, $today }) => ($today ? theme.colors.text : theme.colors.textMuted)};

  abbr {
    text-decoration: none;
  }

  ${({ $today, theme }) =>
    $today &&
    css`
      abbr {
        text-decoration: underline;
        text-decoration-thickness: ${theme.borderWidths.outline}px;
        text-underline-offset: 4px;
      }
    `}
`

const ChoreName = styled.th`
  padding: ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[3]}px
    ${({ theme }) => theme.space[2]}px 0;
  text-align: left;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: break-word;
`

const Cell = styled.td`
  padding: ${({ theme }) => theme.space[2]}px 0;
  text-align: center;
`

const Mark = styled.span<{ $state: DayState }>`
  display: inline-block;
  vertical-align: middle;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  background: ${({ theme }) => theme.colors.surface};

  ${({ $state, theme }) => {
    switch ($state) {
      case 'done':
        return css`
          background: ${theme.colors.accents.grass.base};
        `
      case 'waiting':
        return css`
          background: ${theme.colors.accents.yellow.base};
        `
      case 'notDone':
        return css`
          border-color: ${theme.colors.danger};
          background: ${theme.colors.dangerSurface};
        `
      case 'off':
        return css`
          width: 10px;
          height: 0;
          border-width: ${theme.borderWidths.outline}px 0 0;
          border-color: ${theme.colors.textSubtle};
          border-radius: 0;
          background: none;
        `
      default:
        return ''
    }
  }}
`

const Key = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
`

const Hidden = styled.span`
  ${visuallyHidden};
`
