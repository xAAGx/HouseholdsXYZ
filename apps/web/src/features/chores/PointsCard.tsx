import type { ChoreBoard, HouseholdMember } from '@households/shared'
import styled from 'styled-components'

import { Card, CardList, CardTitle, Muted, PointsBadge, Row, Stack } from '../../components/ui'
import { streakOf } from './streaks'

/** Everyone's points, most first. Children see this too: it's a family board. */
export function PointsCard({ board, members }: { board: ChoreBoard; members: HouseholdMember[] }) {
  const rows = members
    .map((member) => ({
      member,
      balance: board.balances[member.profileId] ?? 0,
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
          {rows.map(({ member, balance, streak }) => (
            <li key={member.profileId}>
              <Row $justify="between">
                <Stack $gap={1}>
                  <Name>
                    {member.displayName}
                    {member.isMe && <Muted as="span"> (you)</Muted>}
                  </Name>
                  {streak > 1 && <Muted>{streak}-day streak</Muted>}
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
