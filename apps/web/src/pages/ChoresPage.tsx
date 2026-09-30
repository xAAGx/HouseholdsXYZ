import type { ChoreBoard } from '@households/shared'
import styled from 'styled-components'

import {
  Card,
  Grid,
  Muted,
  Page,
  PageTitle,
  Playful,
  PointsBadge,
  Row,
  Stack,
  Text,
} from '../components/ui'
import { ApprovalsCard } from '../features/chores/ApprovalsCard'
import { ManageChoresCard } from '../features/chores/ManageChoresCard'
import { PointsCard } from '../features/chores/PointsCard'
import { PointsHistoryCard } from '../features/chores/PointsHistoryCard'
import { useChoreActions, useChoreBoard } from '../features/chores/queries'
import { RewardsCard } from '../features/chores/RewardsCard'
import { streakOf } from '../features/chores/streaks'
import { TodayCard } from '../features/chores/TodayCard'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import { memberNames, type MemberView } from '../features/households/member-view'
import { formatDay } from '../lib/format'

/** /…/chores: chores, points and rewards. A kids' feature, so a little playful. */
export function ChoresPage() {
  return (
    <MemberGate subPath="/chores">
      {(view, basePath) => <Chores view={view} basePath={basePath} />}
    </MemberGate>
  )
}

function Chores({ view, basePath }: { view: MemberView; basePath: string }) {
  const board = useChoreBoard(view.household.id)
  const actions = useChoreActions(view.household.id)
  const me = view.members.find((member) => member.isMe)?.profileId ?? ''
  const names = memberNames(view)

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Stack $gap={1}>
            <PageTitle>Chores & rewards</PageTitle>
            <Muted>
              {view.household.name}
              {board.data && ` · ${formatDay(board.data.today)}`}
            </Muted>
          </Stack>

          {board.isPending && <Muted>Loading…</Muted>}
          {board.isError && <Text>We couldn’t load the chores. Please try again in a moment.</Text>}
          {board.data && (
            <>
              <YourPoints board={board.data} me={me} />
              {board.data.canManage && (
                <ApprovalsCard board={board.data} names={names} actions={actions} />
              )}
              <TopAligned $columns={2} $gap={5}>
                <TodayCard board={board.data} me={me} names={names} actions={actions} />
                <Stack $gap={5}>
                  <RewardsCard board={board.data} me={me} actions={actions} />
                  <PointsCard board={board.data} members={view.members} />
                </Stack>
              </TopAligned>
              {board.data.canManage && (
                <ManageChoresCard board={board.data} members={view.members} actions={actions} />
              )}
              <PointsHistoryCard
                board={board.data}
                members={view.members}
                names={names}
                actions={actions}
              />
            </>
          )}
        </Stack>
      </Page>
    </>
  )
}

function YourPoints({ board, me }: { board: ChoreBoard; me: string }) {
  const balance = board.balances[me] ?? 0
  const streak = streakOf(board, me)
  const doneToday = board.chores.filter(
    (chore) => chore.current?.completedBy === me && chore.current.status !== 'rejected',
  ).length

  return (
    <Card $variant="soft" $tone="grass" $padding="lg">
      <Row $justify="between">
        <Stack $gap={1}>
          <Big>
            <Playful>{balance.toLocaleString()} points</Playful>
          </Big>
          <Muted>
            {doneToday > 0
              ? `${doneToday} ${doneToday === 1 ? 'chore' : 'chores'} done today`
              : 'Nothing done yet today'}
          </Muted>
        </Stack>
        {streak > 1 && <PointsBadge>{streak}-day streak</PointsBadge>}
      </Row>
    </Card>
  )
}

const TopAligned = styled(Grid)`
  align-items: start;
`

const Big = styled.p`
  font-size: ${({ theme }) => theme.fontSizes['3xl']}px;
  line-height: ${({ theme }) => theme.lineHeights.tight};
  color: ${({ theme }) => theme.colors.text};
`
