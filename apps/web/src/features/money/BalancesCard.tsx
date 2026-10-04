import { localDate, type HouseholdMember, type MoneyView } from '@households/shared'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ErrorText,
  Muted,
  Stack,
  Text,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import type { FormatMoney } from './money-format'
import type { MoneyActions } from './queries'

/**
 * Who owes whom for split expenses, as the fewest payments that square
 * everyone up. Recording one adds a settle-up (nothing is paid in the app).
 */
export function BalancesCard({
  view,
  members,
  format,
  actions,
}: {
  view: MoneyView
  members: HouseholdMember[]
  format: FormatMoney
  actions: MoneyActions
}) {
  const name = (id: string | null) =>
    (id && members.find((member) => member.profileId === id)?.displayName) ?? 'A former member'

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <CardTitle as="h2">Who owes whom</CardTitle>
        {view.debts.length === 0 ? (
          <Muted>All square.</Muted>
        ) : (
          <List>
            {view.debts.map((debt) => (
              <li key={`${debt.fromId}-${debt.toId}`}>
                <Line>
                  <Text>
                    {name(debt.fromId)} owes {name(debt.toId)} <b>{format(debt.amountMinor)}</b>
                  </Text>
                  {view.canManage && (
                    <Button
                      type="button"
                      $variant="secondary"
                      $size="sm"
                      disabled={actions.settleUp.isPending}
                      onClick={() =>
                        actions.settleUp.mutate({
                          fromId: debt.fromId,
                          toId: debt.toId,
                          amountMinor: debt.amountMinor,
                          settledOn: localDate(),
                        })
                      }
                    >
                      Mark as paid
                    </Button>
                  )}
                </Line>
              </li>
            ))}
          </List>
        )}
        {actions.settleUp.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.settleUp.error)}</ErrorText>
        )}
        {view.settlements.length > 0 && (
          <Stack $gap={2}>
            <Muted>Recently paid back</Muted>
            <List>
              {view.settlements.slice(0, 3).map((settlement) => (
                <li key={settlement.id}>
                  <Line>
                    <Muted as="span">
                      {name(settlement.fromId)} paid {name(settlement.toId)}{' '}
                      {format(settlement.amountMinor)} · {formatDay(settlement.settledOn)}
                    </Muted>
                    {view.canManage && (
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        disabled={actions.deleteSettlement.isPending}
                        onClick={() => actions.deleteSettlement.mutate(settlement.id)}
                      >
                        Undo
                      </Button>
                    )}
                  </Line>
                </li>
              ))}
            </List>
          </Stack>
        )}
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
