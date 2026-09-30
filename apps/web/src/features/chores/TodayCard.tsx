import { CHORE_REPEAT_LABELS, type ChoreBoard } from '@households/shared'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ErrorText,
  Muted,
  NameTag,
  PointsBadge,
  Row,
  Stack,
  StatusText,
} from '../../components/ui'
import { visuallyHidden } from '../../components/ui/mixins'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import type { ChoreActions } from './queries'

type BoardChore = ChoreBoard['chores'][number]

/**
 * Today's chores. Yours (and anyone's) first, with a big Done button;
 * everyone else's below, so the household can see how it's going.
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
  const manage = board.canManage
  const active = board.chores.filter((chore) => !chore.archived)
  const mine = active.filter((chore) => chore.assignedTo === null || chore.assignedTo === me)
  const others = active.filter((chore) => chore.assignedTo !== null && chore.assignedTo !== me)
  const failed = actions.complete.error ?? actions.undo.error

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Today</CardTitle>
        {active.length === 0 && <Muted>No chores yet.</Muted>}
        {mine.length > 0 && (
          <List>
            {mine.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                me={me}
                names={names}
                actions={actions}
                canManage={manage}
                canDo
              />
            ))}
          </List>
        )}
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
                  canManage={manage}
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
  const who = chore.assignedTo ? (names.get(chore.assignedTo) ?? 'Someone') : 'Anyone'
  const doneBy = current && current.completedBy !== me ? names.get(current.completedBy) : null
  // Mirrors undo_chore_completion: the doer while it waits, managers always.
  const canUndo =
    current !== null &&
    ((current.status === 'pending' && (current.completedBy === me || canManage)) ||
      (current.status === 'approved' && canManage))

  return (
    <li>
      <Line>
        <Stack $gap={1}>
          <Title>{chore.title}</Title>
          <Row $gap={2}>
            <NameTag>{who}</NameTag>
            {chore.points > 0 && <PointsBadge>+{chore.points}</PointsBadge>}
            <Muted as="span">
              {chore.repeat === 'once' && chore.dueOn
                ? `Due ${formatDay(chore.dueOn)}`
                : CHORE_REPEAT_LABELS[chore.repeat]}
            </Muted>
          </Row>
          {chore.notes && <Muted>{chore.notes}</Muted>}
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
