import {
  chorePeriodStart,
  localDate,
  type ChoreBoard,
  type HouseholdMember,
} from '@households/shared'
import styled from 'styled-components'

import { Card, CardList, CardTitle, Muted, PointsBadge, Row, Stack } from '../../components/ui'
import { streakOf } from './streaks'

/**
 * Everyone's points, most first, with what they earned from chores this week
 * (since Monday). Children see this too: it's a family board.
 */
export function PointsCard({ board, members }: { board: ChoreBoard; members: HouseholdMember[] }) {
  const monday = chorePeriodStart('weekly', board.today, board.today)
  const thisWeek = new Map<string, number>()
  for (const completion of board.recent) {
    if (completion.status !== 'approved') continue
    if (localDate(new Date(completion.createdAt)) < monday) continue
    thisWeek.set(
      completion.completedBy,
      (thisWeek.get(completion.completedBy) ?? 0) + completion.points,
    )
  }
  const rows = members
    .map((member) => ({
      member,
      balance: board.balances[member.profileId] ?? 0,
      week: thisWeek.get(member.profileId) ?? 0,
      streak: streakOf(board, member.profileId),
    }))
    .sort(
      (a, b) => b.balance - a.balance || a.member.displayName.localeCompare(b.member.displayName),
    )

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Points</CardTitle>
        <List>
          {rows.map(({ member, balance, week, streak }) => (
            <li key={member.profileId}>
              <Row $justify="between">
                <Stack $gap={1}>
                  <Name>
                    {member.displayName}
                    {member.isMe && <Muted as="span"> (you)</Muted>}
                  </Name>
                  {(week > 0 || streak > 1) && (
                    <Muted>
                      {[
                        week > 0 ? `+${week.toLocaleString()} this week` : null,
                        streak > 1 ? `${streak}-day streak` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Muted>
                  )}
                </Stack>
                <PointsBadge>{balance.toLocaleString()} pts</PointsBadge>
              </Row>
            </li>
          ))}
        </List>
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

const Name = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`
