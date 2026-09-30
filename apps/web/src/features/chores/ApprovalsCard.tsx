import type { ChoreBoard } from '@households/shared'
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
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import type { ChoreActions } from './queries'

/** For people who manage chores: finished chores and reward requests to check. */
export function ApprovalsCard({
  board,
  names,
  actions,
}: {
  board: ChoreBoard
  names: Map<string, string>
  actions: ChoreActions
}) {
  const choreTitles = new Map(board.chores.map((chore) => [chore.id, chore.title]))
  const rewardTitles = new Map(board.rewards.map((reward) => [reward.id, reward.title]))
  const pending = board.recent.filter((completion) => completion.status === 'pending')
  const requests = board.redemptions.filter((redemption) => redemption.status === 'requested')
  const failed = actions.review.error ?? actions.reviewRedemption.error

  if (pending.length === 0 && requests.length === 0) return null

  return (
    <Card $variant="soft" $tone="yellow" $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Waiting for you</CardTitle>
        <List>
          {pending.map((completion) => (
            <li key={completion.id}>
              <Line>
                <Stack $gap={1} $align="start">
                  <Title>
                    {names.get(completion.completedBy) ?? 'Someone'} did “
                    {choreTitles.get(completion.choreId) ?? 'a chore'}”
                  </Title>
                  {completion.points > 0 && <PointsBadge>+{completion.points}</PointsBadge>}
                </Stack>
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
                    disabled={actions.review.isPending}
                    onClick={() =>
                      actions.review.mutate({ completionId: completion.id, approve: false })
                    }
                  >
                    Not yet
                  </Button>
                </Row>
              </Line>
            </li>
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
                      actions.reviewRedemption.mutate({ redemptionId: request.id, approve: false })
                    }
                  >
                    Say no (points back)
                  </Button>
                </Row>
              </Line>
            </li>
          ))}
        </List>
        {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Title = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`
