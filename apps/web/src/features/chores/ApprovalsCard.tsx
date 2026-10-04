import { localDate, type ChoreBoard, type ChoreCompletion } from '@households/shared'
import { useState } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ErrorText,
  Muted,
  PointsBadge,
  Row,
  Stack,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import type { ChoreActions } from './queries'

/**
 * For people who manage chores: finished chores and reward requests to check.
 * Nobody approves their own chores, so yours are listed apart, waiting for
 * someone else.
 */
export function ApprovalsCard({
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
  const choreTitles = new Map(board.chores.map((chore) => [chore.id, chore.title]))
  const rewardTitles = new Map(board.rewards.map((reward) => [reward.id, reward.title]))
  const pending = board.recent.filter((completion) => completion.status === 'pending')
  const toReview = pending.filter((completion) => completion.completedBy !== me)
  const mine = pending.filter((completion) => completion.completedBy === me)
  const requests = board.redemptions.filter((redemption) => redemption.status === 'requested')
  const failed = actions.review.error ?? actions.reviewRedemption.error

  if (toReview.length === 0 && requests.length === 0 && mine.length === 0) return null

  return (
    <Card $variant="soft" $tone="yellow" $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Waiting for you</CardTitle>
        {toReview.length === 0 && requests.length === 0 && <Muted>Nothing to check.</Muted>}
        {(toReview.length > 0 || requests.length > 0) && (
          <List>
            {toReview.map((completion) => (
              <PendingRow
                key={completion.id}
                completion={completion}
                who={names.get(completion.completedBy) ?? 'Someone'}
                title={choreTitles.get(completion.choreId) ?? 'a chore'}
                today={board.today}
                actions={actions}
              />
            ))}
            {requests.map((request) => (
              <li key={request.id}>
                <Line>
                  <Stack $gap={1}>
                    <Title>
                      {names.get(request.requestedBy) ?? 'Someone'} would like “
                      {rewardTitles.get(request.rewardId) ?? 'a reward'}”
                    </Title>
                    <Muted>{request.cost} points, already set aside</Muted>
                  </Stack>
                  <Row $gap={2}>
                    <Button
                      type="button"
                      $size="sm"
                      disabled={actions.reviewRedemption.isPending}
                      onClick={() =>
                        actions.reviewRedemption.mutate({ redemptionId: request.id, approve: true })
                      }
                    >
                      Given
                    </Button>
                    <Button
                      type="button"
                      $variant="ghost"
                      $size="sm"
                      disabled={actions.reviewRedemption.isPending}
                      onClick={() =>
                        actions.reviewRedemption.mutate({
                          redemptionId: request.id,
                          approve: false,
                        })
                      }
                    >
                      Say no (points back)
                    </Button>
                  </Row>
                </Line>
              </li>
            ))}
          </List>
        )}
        {mine.length > 0 && (
          <Muted>
            Your own {mine.length === 1 ? 'chore is' : 'chores are'} waiting for someone else who
            manages chores:{' '}
            {mine.map((completion) => choreTitles.get(completion.choreId) ?? 'a chore').join(', ')}.
          </Muted>
        )}
        {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
      </Stack>
    </Card>
  )
}

/** Approve, or send it back with a reason the person will see. */
function PendingRow({
  completion,
  who,
  title,
  today,
  actions,
}: {
  completion: ChoreCompletion
  who: string
  title: string
  today: string
  actions: ChoreActions
}) {
  const [sendingBack, setSendingBack] = useState(false)
  const [note, setNote] = useState('')
  const doneOn = localDate(new Date(completion.createdAt))

  return (
    <li>
      <Stack $gap={3}>
        <Line>
          <Stack $gap={1} $align="start">
            <Title>
              {who} did “{title}”
            </Title>
            <Row $gap={2}>
              {completion.points > 0 && <PointsBadge>+{completion.points}</PointsBadge>}
              {doneOn !== today && <Muted as="span">{formatDay(doneOn)}</Muted>}
            </Row>
          </Stack>
          {!sendingBack && (
            <Row $gap={2}>
              <Button
                type="button"
                $size="sm"
                disabled={actions.review.isPending}
                onClick={() =>
                  actions.review.mutate({ completionId: completion.id, approve: true })
                }
              >
                Approve
              </Button>
              <Button
                type="button"
                $variant="ghost"
                $size="sm"
                onClick={() => setSendingBack(true)}
              >
                Not yet
              </Button>
            </Row>
          )}
        </Line>
        {sendingBack && (
          <Stack $gap={3}>
            <TextField
              label={`What should ${who} do first? (optional)`}
              placeholder="Wipe the counter too"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
            <Row>
              <Button
                type="button"
                $variant="secondary"
                $size="sm"
                disabled={actions.review.isPending}
                onClick={() =>
                  actions.review.mutate(
                    { completionId: completion.id, approve: false, note: note.trim() || undefined },
                    { onSuccess: () => setSendingBack(false) },
                  )
                }
              >
                Send back
              </Button>
              <Button
                type="button"
                $variant="ghost"
                $size="sm"
                onClick={() => setSendingBack(false)}
              >
                Cancel
              </Button>
            </Row>
          </Stack>
        )}
      </Stack>
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
