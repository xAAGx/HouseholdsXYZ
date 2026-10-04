import type { Expense, HouseholdMember, MoneyView } from '@households/shared'
import { useState } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ConfirmButton,
  Muted,
  Row,
  Stack,
  Text,
} from '../../components/ui'
import { formatDay } from '../../lib/format'
import { ExpenseForm } from './ExpenseForm'
import type { FormatMoney } from './money-format'
import { monthLabel } from './money-format'
import type { MoneyActions } from './queries'

/** The month's spending: total, what it went on, and adding to it. */
export function ExpensesCard({
  view,
  members,
  me,
  format,
  actions,
}: {
  view: MoneyView
  members: HouseholdMember[]
  me: string
  format: FormatMoney
  actions: MoneyActions
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const names = new Map(members.map((member) => [member.profileId, member.displayName]))
  const byDay = new Map<string, Expense[]>()
  for (const expense of view.expenses) {
    byDay.set(expense.spentOn, [...(byDay.get(expense.spentOn) ?? []), expense])
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Row $justify="between">
          <Stack $gap={1}>
            <CardTitle as="h2">Spending</CardTitle>
            <Muted>
              {monthLabel(view.month)}: {format(view.monthTotalMinor)}
            </Muted>
          </Stack>
          {view.canManage && !adding && (
            <Button type="button" $size="sm" onClick={() => setAdding(true)}>
              Add expense
            </Button>
          )}
        </Row>

        {adding && (
          <ExpenseForm
            expense={null}
            categories={view.categories}
            members={members}
            me={me}
            digits={view.currencyDigits}
            format={format}
            busy={actions.addExpense.isPending}
            error={actions.addExpense.error}
            onSave={async (input) => {
              await actions.addExpense.mutateAsync(input)
              setAdding(false)
            }}
            onCancel={() => {
              actions.addExpense.reset()
              setAdding(false)
            }}
          />
        )}

        {view.expenses.length === 0 ? (
          <Muted>Nothing spent this month yet.</Muted>
        ) : (
          [...byDay].map(([day, expenses]) => (
            <Stack key={day} $gap={2}>
              <DayHeading>{formatDay(day)}</DayHeading>
              <List>
                {expenses.map((expense) =>
                  editing === expense.id ? (
                    <li key={expense.id}>
                      <ExpenseForm
                        expense={expense}
                        categories={view.categories}
                        members={members}
                        me={me}
                        digits={view.currencyDigits}
                        format={format}
                        busy={actions.updateExpense.isPending}
                        error={actions.updateExpense.error}
                        onSave={async (json) => {
                          await actions.updateExpense.mutateAsync({ expenseId: expense.id, json })
                          setEditing(null)
                        }}
                        onCancel={() => {
                          actions.updateExpense.reset()
                          setEditing(null)
                        }}
                      />
                    </li>
                  ) : (
                    <li key={expense.id}>
                      <Line>
                        <Stack $gap={1}>
                          <Title>{expense.title}</Title>
                          <Muted as="span">
                            {[
                              expense.category,
                              expense.paidBy && `paid by ${names.get(expense.paidBy) ?? 'someone'}`,
                              expense.splitBetween.length > 0 &&
                                `split ${expense.splitBetween.length} ways`,
                              expense.billId && 'bill',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Muted>
                          {expense.notes && <Muted as="span">{expense.notes}</Muted>}
                        </Stack>
                        <Row $gap={2}>
                          <Amount>{format(expense.amountMinor)}</Amount>
                          {view.canManage && (
                            <>
                              <Button
                                type="button"
                                $variant="ghost"
                                $size="sm"
                                onClick={() => setEditing(expense.id)}
                              >
                                Edit
                              </Button>
                              <ConfirmButton
                                message={`Delete “${expense.title}”? This can’t be undone.`}
                                confirmLabel="Yes, delete it"
                                busy={actions.deleteExpense.isPending}
                                onConfirm={() => actions.deleteExpense.mutate(expense.id)}
                              >
                                Delete
                              </ConfirmButton>
                            </>
                          )}
                        </Row>
                      </Line>
                    </li>
                  ),
                )}
              </List>
            </Stack>
          ))
        )}
        {!view.canManage && (
          <Text>Only people who manage the household’s money can add or change expenses.</Text>
        )}
      </Stack>
    </Card>
  )
}

const DayHeading = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textMuted};
`

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

const Amount = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.text};
`
