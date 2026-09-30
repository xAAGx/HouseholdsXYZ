import { createRewardInputSchema, type ChoreBoard } from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ErrorText,
  Grid,
  Muted,
  PointsBadge,
  Row,
  Stack,
  StatusText,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import type { ChoreActions } from './queries'

/** What points can buy. Anyone can ask; people who manage chores say yes. */
export function RewardsCard({
  board,
  me,
  actions,
}: {
  board: ChoreBoard
  me: string
  actions: ChoreActions
}) {
  const balance = board.balances[me] ?? 0
  const rewards = board.rewards.filter((reward) => !reward.archived)
  const titles = new Map(board.rewards.map((reward) => [reward.id, reward.title]))
  const myRequests = board.redemptions.filter(
    (redemption) => redemption.requestedBy === me && redemption.status === 'requested',
  )
  const failed =
    actions.redeem.error ?? actions.cancelRedemption.error ?? actions.updateReward.error

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Row $justify="between">
          <CardTitle>Rewards</CardTitle>
          <PointsBadge>You have {balance.toLocaleString()} pts</PointsBadge>
        </Row>

        {rewards.length === 0 && (
          <Muted>
            {board.canManage ? 'Add a reward below.' : 'No rewards yet. Ask a parent to add some.'}
          </Muted>
        )}
        {rewards.length > 0 && (
          <List>
            {rewards.map((reward) => {
              const short = reward.cost - balance
              return (
                <li key={reward.id}>
                  <Line>
                    <Stack $gap={1} $align="start">
                      <Title>{reward.title}</Title>
                      {reward.description && <Muted>{reward.description}</Muted>}
                      <PointsBadge>{reward.cost.toLocaleString()} pts</PointsBadge>
                    </Stack>
                    <Row $gap={2}>
                      {short > 0 ? (
                        <Muted as="span">{short.toLocaleString()} more to go</Muted>
                      ) : (
                        <Button
                          type="button"
                          $variant="secondary"
                          $size="sm"
                          disabled={actions.redeem.isPending}
                          onClick={() => actions.redeem.mutate(reward.id)}
                        >
                          Ask for it
                        </Button>
                      )}
                      {board.canManage && (
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          onClick={() =>
                            actions.updateReward.mutate({ rewardId: reward.id, archived: true })
                          }
                        >
                          Archive
                        </Button>
                      )}
                    </Row>
                  </Line>
                </li>
              )
            })}
          </List>
        )}

        {myRequests.length > 0 && (
          <Stack $gap={2}>
            <Muted>Waiting for a yes</Muted>
            {myRequests.map((request) => (
              <Row key={request.id} $justify="between">
                <StatusText $status="warning">
                  {titles.get(request.rewardId) ?? 'Reward'}
                </StatusText>
                <Button
                  type="button"
                  $variant="ghost"
                  $size="sm"
                  disabled={actions.cancelRedemption.isPending}
                  onClick={() => actions.cancelRedemption.mutate(request.id)}
                >
                  Cancel (points back)
                </Button>
              </Row>
            ))}
          </Stack>
        )}

        {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
        {board.canManage && <NewReward actions={actions} />}
      </Stack>
    </Card>
  )
}

function NewReward({ actions }: { actions: ChoreActions }) {
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState('50')
  const [errors, setErrors] = useState<{ title?: string; cost?: string }>({})

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = createRewardInputSchema.safeParse({ title, cost: Number(cost) })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'title' || field === 'cost') && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await actions.createReward.mutateAsync(parsed.data)
      setTitle('')
    } catch {
      // Shown below.
    }
  }

  return (
    <Form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={2} $gap={3}>
          <TextField
            label="New reward"
            placeholder="Movie night"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
          />
          <TextField
            label="Costs (points)"
            type="number"
            inputMode="numeric"
            min={1}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            error={errors.cost}
          />
        </Grid>
        {actions.createReward.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.createReward.error)}</ErrorText>
        )}
        <Row>
          <Button
            type="submit"
            $variant="secondary"
            $size="sm"
            disabled={actions.createReward.isPending}
          >
            Add reward
          </Button>
        </Row>
      </Stack>
    </Form>
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

const Form = styled.form`
  padding-top: ${({ theme }) => theme.space[4]}px;
  border-top: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme }) => theme.colors.hairline};
`
