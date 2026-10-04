import {
  budgetInputSchema,
  moneyInput,
  parseMoney,
  type Budget,
  type MoneyView,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ConfirmButton,
  ErrorText,
  Grid,
  Muted,
  ProgressBar,
  Row,
  Select,
  Stack,
  StatusText,
  Text,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import type { FormatMoney } from './money-format'
import type { MoneyActions } from './queries'

/** A monthly limit per category, and how much of it this month has used. */
export function BudgetsCard({
  view,
  format,
  actions,
}: {
  view: MoneyView
  format: FormatMoney
  actions: MoneyActions
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const unused = view.categories.filter(
    (category) =>
      !view.budgets.some((budget) => budget.category.toLowerCase() === category.toLowerCase()),
  )

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Row $justify="between">
          <CardTitle as="h2">Budgets</CardTitle>
          {view.canManage && !adding && unused.length > 0 && (
            <Button type="button" $variant="secondary" $size="sm" onClick={() => setAdding(true)}>
              Add budget
            </Button>
          )}
        </Row>
        {adding && (
          <BudgetForm
            budget={null}
            categories={unused}
            digits={view.currencyDigits}
            busy={actions.addBudget.isPending}
            error={actions.addBudget.error}
            onSave={async (json) => {
              await actions.addBudget.mutateAsync(json)
              setAdding(false)
            }}
            onCancel={() => {
              actions.addBudget.reset()
              setAdding(false)
            }}
          />
        )}
        {view.budgets.length === 0 && !adding && (
          <Muted>
            {view.canManage
              ? 'Set a monthly amount for groceries, eating out or anything else, and see how the month is going.'
              : 'No budgets yet.'}
          </Muted>
        )}
        <List>
          {view.budgets.map((budget) =>
            editing === budget.id ? (
              <li key={budget.id}>
                <BudgetForm
                  budget={budget}
                  categories={[budget.category]}
                  digits={view.currencyDigits}
                  busy={actions.updateBudget.isPending}
                  error={actions.updateBudget.error}
                  onSave={async (json) => {
                    await actions.updateBudget.mutateAsync({ budgetId: budget.id, json })
                    setEditing(null)
                  }}
                  onCancel={() => {
                    actions.updateBudget.reset()
                    setEditing(null)
                  }}
                />
              </li>
            ) : (
              <li key={budget.id}>
                <Stack $gap={2}>
                  <Row $justify="between">
                    <Text>
                      <b>{budget.category}</b>
                    </Text>
                    <Muted as="span">
                      {format(budget.spentMinor)} of {format(budget.monthlyMinor)}
                    </Muted>
                  </Row>
                  <ProgressBar
                    value={budget.spentMinor}
                    max={budget.monthlyMinor}
                    kind="limit"
                    label={`${budget.category}: ${format(budget.spentMinor)} of ${format(budget.monthlyMinor)} spent`}
                  />
                  <Row $justify="between">
                    {budget.spentMinor > budget.monthlyMinor ? (
                      <StatusText $status="warning">
                        {format(budget.spentMinor - budget.monthlyMinor)} over
                      </StatusText>
                    ) : (
                      <Muted as="span">
                        {format(budget.monthlyMinor - budget.spentMinor)} left
                      </Muted>
                    )}
                    {view.canManage && (
                      <Row $gap={1}>
                        <Button
                          type="button"
                          $variant="ghost"
                          $size="sm"
                          onClick={() => setEditing(budget.id)}
                        >
                          Edit
                        </Button>
                        <ConfirmButton
                          message={`Stop budgeting for ${budget.category}? Expenses stay.`}
                          confirmLabel="Yes, remove it"
                          busy={actions.deleteBudget.isPending}
                          onConfirm={() => actions.deleteBudget.mutate(budget.id)}
                        >
                          Remove
                        </ConfirmButton>
                      </Row>
                    )}
                  </Row>
                </Stack>
              </li>
            ),
          )}
        </List>
      </Stack>
    </Card>
  )
}

function BudgetForm({
  budget,
  categories,
  digits,
  busy,
  error,
  onSave,
  onCancel,
}: {
  budget: Budget | null
  categories: string[]
  digits: number
  busy: boolean
  error: unknown
  onSave: (input: { category: string; monthlyMinor: number }) => Promise<void>
  onCancel: () => void
}) {
  const [category, setCategory] = useState(budget?.category ?? categories[0] ?? '')
  const [amount, setAmount] = useState(budget ? moneyInput(budget.monthlyMinor, digits) : '')
  const [problem, setProblem] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = budgetInputSchema.safeParse({
      category,
      monthlyMinor: parseMoney(amount, digits) ?? Number.NaN,
    })
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the amount.')
      return
    }
    setProblem(null)
    try {
      await onSave(parsed.data)
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={2} $gap={3}>
          <Select
            label="Category"
            value={category}
            disabled={budget !== null}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <TextField
            label="Each month"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={problem ?? undefined}
          />
        </Grid>
        {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
        <Row>
          <Button type="submit" $size="sm" disabled={busy}>
            {busy ? 'Saving…' : 'Save budget'}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`
