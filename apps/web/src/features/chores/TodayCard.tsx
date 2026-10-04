import {
  CHORE_REPEAT_LABELS,
  CHORE_TIME_OF_DAY_LABELS,
  CHORE_TIMES_OF_DAY,
  WEEKDAY_LABELS,
  type ChoreBoard,
} from '@households/shared'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ErrorText,
  Muted,
  NameTag,
  Playful,
  PointsBadge,
  Row,
  Stack,
  StatusText,
  Text,
} from '../../components/ui'
import { visuallyHidden } from '../../components/ui/mixins'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import type { ChoreActions } from './queries'

type BoardChore = ChoreBoard['chores'][number]

// Morning first, "any time" last: the order a day goes.
const TIME_ORDER = [...CHORE_TIMES_OF_DAY.filter((time) => time !== 'anytime'), 'anytime'] as const

/**
 * Today's chores, by time of day. Yours (whose turn it is, or anyone's) come
 * with a big Done button; everyone else's show how it's going.
 */
export function TodayCard({
  board,
  me,
  names,
  actions,
}: {
  board: ChoreBoard
  me: string
  names: Map<string, string>
  actions: ChoreActions
}) {
  const active = board.chores.filter((chore) => !chore.archived && chore.onToday)
  const mine = active.filter((chore) => chore.turn === null || chore.turn === me)
  const others = active.filter((chore) => chore.turn !== null && chore.turn !== me)
  const failed = actions.complete.error ?? actions.undo.error
  const skipped = board.chores.filter((chore) => !chore.archived && !chore.onToday).length

  return (
    <Card $padding="lg">
      <Stack $gap={5}>
        <CardTitle>Today</CardTitle>
        {active.length === 0 && (
          <Muted>{skipped > 0 ? 'No chores today. Enjoy it.' : 'No chores yet.'}</Muted>
        )}
        {TIME_ORDER.map((time) => {
          const group = mine.filter((chore) => chore.timeOfDay === time)
          if (group.length === 0) return null
          return (
            <Stack key={time} $gap={2}>
              {mine.some((chore) => chore.timeOfDay !== 'anytime') && (
                <Muted>
                  <Playful>{CHORE_TIME_OF_DAY_LABELS[time]}</Playful>
                </Muted>
              )}
              <List>
                {group.map((chore) => (
                  <ChoreRow
                    key={chore.id}
                    chore={chore}
                    me={me}
                    names={names}
                    actions={actions}
                    canManage={board.canManage}
                    canDo
                  />
                ))}
              </List>
            </Stack>
          )
        })}
        {others.length > 0 && (
          <Stack $gap={2}>
            <Muted>Everyone else</Muted>
            <List>
              {others.map((chore) => (
                <ChoreRow
                  key={chore.id}
                  chore={chore}
                  me={me}
                  names={names}
                  actions={actions}
                  canManage={board.canManage}
                />
              ))}
            </List>
          </Stack>
        )}
        {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
      </Stack>
    </Card>
  )
}

function schedule(chore: BoardChore): string {
  if (chore.repeat === 'once') return chore.dueOn ? `Due ${formatDay(chore.dueOn)}` : 'Once'
  if (chore.repeat === 'daily' && chore.weekdays && chore.weekdays.length < 7) {
    return WEEKDAY_LABELS.filter((w) => chore.weekdays?.includes(w.day))
      .map((w) => w.short)
      .join(', ')
  }
  return CHORE_REPEAT_LABELS[chore.repeat]
}

function ChoreRow({
  chore,
  me,
  names,
  actions,
  canManage,
  canDo = false,
}: {
  chore: BoardChore
  me: string
  names: Map<string, string>
  actions: ChoreActions
  canManage: boolean
  canDo?: boolean
}) {
  const current = chore.current
  const who = chore.turn
    ? chore.turn === me
      ? 'You'
      : (names.get(chore.turn) ?? 'Someone')
    : 'Anyone'
  // With a rotation, say whose turn it is today.
  const turnLabel = !chore.rotation ? who : chore.turn === me ? 'Your turn' : `${who}’s turn`
  const doneBy = current && current.completedBy !== me ? names.get(current.completedBy) : null
  // Mirrors undo_chore_completion: the doer while it waits, managers always.
  const canUndo =
    current !== null &&
    ((current.status === 'pending' && (current.completedBy === me || canManage)) ||
      (current.status === 'approved' && canManage))

  return (
    <li>
      <Line>
        <Stack $gap={1} $align="start">
          <Title>{chore.title}</Title>
          <Row $gap={2}>
            <NameTag>{turnLabel}</NameTag>
            {chore.points > 0 && <PointsBadge>+{chore.points}</PointsBadge>}
            <Muted as="span">{schedule(chore)}</Muted>
          </Row>
          {chore.notes && <Muted>{chore.notes}</Muted>}
          {current?.status === 'rejected' && current.reviewNote && (
            <Text>“{current.reviewNote}”</Text>
          )}
        </Stack>
        <Row $gap={2}>
          {current?.status === 'approved' && (
            <StatusText $status="success">{doneBy ? `Done by ${doneBy}` : 'Done'}</StatusText>
          )}
          {current?.status === 'pending' && (
            <StatusText $status="warning">
              {doneBy ? `${doneBy}: waiting for approval` : 'Waiting for approval'}
            </StatusText>
          )}
          {current?.status === 'rejected' && (
            <StatusText $status="danger">Not quite: try again</StatusText>
          )}
          {canDo && (!current || current.status === 'rejected') && (
            <Button
              type="button"
              $size="sm"
              disabled={actions.complete.isPending}
              onClick={() => actions.complete.mutate(chore.id)}
            >
              Done<Hidden>: {chore.title}</Hidden>
            </Button>
          )}
          {canUndo && current && (
            <Button
              type="button"
              $variant="ghost"
              $size="sm"
              disabled={actions.undo.isPending}
              onClick={() => actions.undo.mutate(current.id)}
            >
              Undo
            </Button>
          )}
        </Row>
      </Line>
    </li>
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Title = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Hidden = styled.span`
  ${visuallyHidden};
`
