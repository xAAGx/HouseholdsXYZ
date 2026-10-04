import { ApiError, localDate } from '@households/shared'
import { useState } from 'react'
import styled from 'styled-components'

import { Icon } from '../components/icons'
import { Button, CardTitle, Grid, Muted, Page, PageTitle, Row, Stack, Text } from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import type { MemberView } from '../features/households/member-view'
import { BalancesCard } from '../features/money/BalancesCard'
import { BillsCard } from '../features/money/BillsCard'
import { BudgetsCard } from '../features/money/BudgetsCard'
import { ExpensesCard } from '../features/money/ExpensesCard'
import { monthLabel, moneyFormatter, shiftMonth } from '../features/money/money-format'
import { PocketMoneySection } from '../features/money/PocketMoney'
import { useMoney, useMoneyActions, usePocket, usePocketActions } from '../features/money/queries'
import { apiErrorMessage } from '../lib/api-errors'

/**
 * /…/money: the household's spending, who owes whom, budgets and bills (for
 * people who can see money), and pocket money (children see their own).
 */
export function MoneyPage() {
  return (
    <MemberGate subPath="/money">
      {(view, basePath) => <Money view={view} basePath={basePath} />}
    </MemberGate>
  )
}

function Money({ view, basePath }: { view: MemberView; basePath: string }) {
  const { session } = useAuth()
  const me = session?.user.id ?? ''
  const householdId = view.household.id
  const thisMonth = localDate().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const seesMoney = view.permissions.includes('view_expenses')
  const money = useMoney(householdId, month)
  const pocket = usePocket(householdId)
  const actions = useMoneyActions(householdId)
  const pocketActions = usePocketActions(householdId)
  const format = moneyFormatter(view.household.currency, view.household.currencyDigits)
  const hidden = money.error instanceof ApiError && money.error.status === 404

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Row $justify="between">
            <Stack $gap={1}>
              <PageTitle>{seesMoney ? 'Money' : 'Pocket money'}</PageTitle>
              <Muted>{view.household.name}</Muted>
            </Stack>
            {seesMoney && !hidden && (
              <Row $gap={1}>
                <Button
                  type="button"
                  $variant="ghost"
                  $size="sm"
                  aria-label="Previous month"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  <Icon name="chevronLeft" size={18} />
                </Button>
                <MonthName>{monthLabel(month)}</MonthName>
                <Button
                  type="button"
                  $variant="ghost"
                  $size="sm"
                  aria-label="Next month"
                  disabled={month >= thisMonth}
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  <Icon name="chevronRight" size={18} />
                </Button>
              </Row>
            )}
          </Row>

          {seesMoney && !hidden && (
            <>
              {money.isPending && <Muted>Loading…</Muted>}
              {money.isError && (
                <Text>We couldn’t load the household’s money. {apiErrorMessage(money.error)}</Text>
              )}
              {money.data && (
                <TopAligned $gap={5}>
                  <ExpensesCard
                    view={money.data}
                    members={view.members}
                    me={me}
                    format={format}
                    actions={actions}
                  />
                  <Stack $gap={5}>
                    <BalancesCard
                      view={money.data}
                      members={view.members}
                      format={format}
                      actions={actions}
                    />
                    <BillsCard view={money.data} format={format} actions={actions} />
                    <BudgetsCard view={money.data} format={format} actions={actions} />
                  </Stack>
                </TopAligned>
              )}
            </>
          )}

          <Stack $gap={4}>
            {seesMoney ? (
              <Stack $gap={1}>
                <CardTitle as="h2">Pocket money</CardTitle>
                <Muted>Kept track of here; no real money moves.</Muted>
              </Stack>
            ) : (
              <Muted>Your grown-ups keep track of it here.</Muted>
            )}
            {pocket.isPending && <Muted>Loading…</Muted>}
            {pocket.isError && (
              <Text>We couldn’t load pocket money. {apiErrorMessage(pocket.error)}</Text>
            )}
            {pocket.data && (
              <PocketMoneySection
                view={pocket.data}
                members={view.members}
                actions={pocketActions}
              />
            )}
          </Stack>
        </Stack>
      </Page>
    </>
  )
}

const TopAligned = styled(Grid)`
  align-items: start;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const MonthName = styled.span`
  min-width: 140px;
  text-align: center;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`
