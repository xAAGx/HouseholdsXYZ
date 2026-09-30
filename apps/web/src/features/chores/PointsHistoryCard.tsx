import {
  adjustPointsInputSchema,
  type ChoreBoard,
  type HouseholdMember,
  type PointsEntry,
} from '@households/shared'
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
  Select,
  Stack,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDate } from '../../lib/format'
import type { ChoreActions } from './queries'

/** Where points came from and went, newest first; managers can give or take. */
export function PointsHistoryCard({
  board,
  members,
  names,
  actions,
}: {
  board: ChoreBoard
  members: HouseholdMember[]
  names: Map<string, string>
  actions: ChoreActions
}) {
  const choreTitles = new Map(board.chores.map((chore) => [chore.id, chore.title]))
  const choreByCompletion = new Map(
    board.recent.map((completion) => [completion.id, choreTitles.get(completion.choreId)]),
  )
  const rewardByRedemption = new Map(
    board.redemptions.map((redemption) => [
      redemption.id,
      board.rewards.find((reward) => reward.id === redemption.rewardId)?.title,
    ]),
  )

  const describe = (entry: PointsEntry) => {
    if (entry.reason === 'chore') {
      return (
        (entry.choreCompletionId && choreByCompletion.get(entry.choreCompletionId)) ||
        entry.note ||
        'A chore'
      )
    }
    if (entry.reason === 'reward') {
      const reward =
        (entry.redemptionId && rewardByRedemption.get(entry.redemptionId)) || 'A reward'
      return entry.note ? `${reward}: ${entry.note.toLowerCase()}` : reward
    }
    return entry.note ?? 'Points changed'
  }

  return (
    <Card $variant="plain" $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Points history</CardTitle>
        {board.canManage && <AdjustPoints members={members} actions={actions} />}
        {board.ledger.length === 0 ? (
          <Muted>No points yet.</Muted>
        ) : (
          <List>
            {board.ledger.map((entry) => (
              <li key={entry.id}>
                <Row $justify="between">
                  <Stack $gap={1}>
                    <Title>
                      {names.get(entry.profileId) ?? 'Someone'}: {describe(entry)}
                    </Title>
                    <Muted>{formatDate(entry.createdAt)}</Muted>
                  </Stack>
                  <PointsBadge>
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta.toLocaleString()}
                  </PointsBadge>
                </Row>
              </li>
            ))}
          </List>
        )}
      </Stack>
    </Card>
  )
}

function AdjustPoints({ members, actions }: { members: HouseholdMember[]; actions: ChoreActions }) {
  const others = members.filter((member) => !member.isMe)
  const [profileId, setProfileId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ profileId?: string; delta?: string; note?: string }>({})

  async function onSubmit(event: FormEvent, sign: 1 | -1) {
    event.preventDefault()
    const parsed = adjustPointsInputSchema.safeParse({
      profileId,
      delta: sign * Math.abs(Number(amount)),
      note,
    })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'profileId' || field === 'delta' || field === 'note') && !next[field]) {
          next[field] = field === 'profileId' ? 'Choose someone.' : issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await actions.adjustPoints.mutateAsync(parsed.data)
      setAmount('')
      setNote('')
    } catch {
      // Shown below.
    }
  }

  if (others.length === 0) return null

  return (
    <Form onSubmit={(e) => void onSubmit(e, 1)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={3} $gap={3}>
          <Select
            label="Give or take points"
            placeholder="Choose someone"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            error={errors.profileId}
          >
            {others.map((member) => (
              <option key={member.profileId} value={member.profileId}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <TextField
            label="Points"
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.delta}
          />
          <TextField
            label="Why"
            placeholder="Helped with dinner"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            error={errors.note}
          />
        </Grid>
        {actions.adjustPoints.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.adjustPoints.error)}</ErrorText>
        )}
        <Row>
          <Button
            type="submit"
            $variant="secondary"
            $size="sm"
            disabled={actions.adjustPoints.isPending}
          >
            Give points
          </Button>
          <Button
            type="button"
            $variant="ghost"
            $size="sm"
            disabled={actions.adjustPoints.isPending}
            onClick={(e) => void onSubmit(e, -1)}
          >
            Take points
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

const Title = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Form = styled.form`
  padding-bottom: ${({ theme }) => theme.space[4]}px;
  border-bottom: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme }) => theme.colors.hairline};
`
