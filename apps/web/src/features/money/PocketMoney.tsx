import {
  allowanceInputSchema,
  moneyInput,
  parseMoney,
  POCKET_KIND_LABELS,
  savingsGoalInputSchema,
  WEEKDAY_LABELS,
  type HouseholdMember,
  type PocketAccount,
  type PocketView,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  Checkbox,
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
import { formatDate } from '../../lib/format'
import { moneyFormatter, type FormatMoney } from './money-format'
import type { PocketActions } from './queries'

/**
 * Pocket money: a balance per child that parents keep (no real money moves),
 * an allowance paid on a weekday, savings goals, and points swapped for
 * money at the household's rate.
 */
export function PocketMoneySection({
  view,
  members,
  actions,
}: {
  view: PocketView
  members: HouseholdMember[]
  actions: PocketActions
}) {
  const format = moneyFormatter(view.currency, view.currencyDigits)
  const name = (id: string) =>
    members.find((member) => member.profileId === id)?.displayName ?? 'Someone'

  if (view.accounts.length === 0) {
    return (
      <Card $padding="lg">
        <Stack $gap={3}>
          <CardTitle as="h2">Pocket money</CardTitle>
          <Muted>
            {view.canManage
              ? 'Pocket money is for the children and teens in the household. Add a child from the household page to start.'
              : 'Nothing here yet.'}
          </Muted>
        </Stack>
      </Card>
    )
  }

  return (
    <Accounts>
      {view.accounts.map((account) => (
        <PocketAccountCard
          key={account.profileId}
          account={account}
          title={view.canManage ? name(account.profileId) : 'Your pocket money'}
          view={view}
          format={format}
          actions={actions}
        />
      ))}
    </Accounts>
  )
}

function PocketAccountCard({
  account,
  title,
  view,
  format,
  actions,
}: {
  account: PocketAccount
  title: string
  view: PocketView
  format: FormatMoney
  actions: PocketActions
}) {
  const [open, setOpen] = useState<'money' | 'allowance' | 'swap' | 'goal' | null>(null)
  const [history, setHistory] = useState(5)
  const manage = view.canManage
  const worth =
    view.pointsValueMinor !== null
      ? Math.floor((account.points * view.pointsValueMinor) / 100)
      : null
  const weekday = (day: number) => WEEKDAY_LABELS.find((label) => label.day === day)?.long ?? ''

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Row $justify="between">
          <CardTitle as="h2">{title}</CardTitle>
          <Balance aria-label={`Balance: ${format(account.balanceMinor)}`}>
            {format(account.balanceMinor)}
          </Balance>
        </Row>

        <Stack $gap={1}>
          <Text>
            {account.allowance?.active
              ? `Allowance: ${format(account.allowance.amountMinor)} every ${weekday(account.allowance.weekday)}`
              : 'No allowance'}
          </Text>
          {worth !== null && (
            <Muted>
              {account.points} {account.points === 1 ? 'point' : 'points'} from chores
              {account.points > 0 ? `, worth ${format(worth)}` : ''}
            </Muted>
          )}
        </Stack>

        {manage && (
          <Row $gap={2}>
            <Button type="button" $variant="secondary" $size="sm" onClick={() => setOpen('money')}>
              Add or take out
            </Button>
            <Button
              type="button"
              $variant="secondary"
              $size="sm"
              onClick={() => setOpen('allowance')}
            >
              {account.allowance ? 'Change allowance' : 'Set allowance'}
            </Button>
            {worth !== null && account.points > 0 && (
              <Button type="button" $variant="secondary" $size="sm" onClick={() => setOpen('swap')}>
                Swap points
              </Button>
            )}
          </Row>
        )}

        {open === 'money' && (
          <MoneyForm
            account={account}
            digits={view.currencyDigits}
            actions={actions}
            onDone={() => setOpen(null)}
          />
        )}
        {open === 'allowance' && (
          <AllowanceForm
            account={account}
            digits={view.currencyDigits}
            actions={actions}
            onDone={() => setOpen(null)}
          />
        )}
        {open === 'swap' && view.pointsValueMinor !== null && (
          <SwapForm
            account={account}
            rate={view.pointsValueMinor}
            format={format}
            actions={actions}
            onDone={() => setOpen(null)}
          />
        )}

        <Stack $gap={3}>
          <Row $justify="between">
            <SubTitle>Saving for</SubTitle>
            {open !== 'goal' && account.goals.length < 30 && (
              <Button type="button" $variant="ghost" $size="sm" onClick={() => setOpen('goal')}>
                Add a goal
              </Button>
            )}
          </Row>
          {open === 'goal' && (
            <GoalForm
              account={account}
              digits={view.currencyDigits}
              actions={actions}
              onDone={() => setOpen(null)}
            />
          )}
          {account.goals.length === 0 && open !== 'goal' && <Muted>No goals yet.</Muted>}
          <List>
            {account.goals.map((goal) => (
              <li key={goal.id}>
                <Stack $gap={2}>
                  <Row $justify="between">
                    <Text>
                      <b>{goal.title}</b>
                    </Text>
                    <Muted as="span">
                      {format(Math.min(account.balanceMinor, goal.targetMinor))} of{' '}
                      {format(goal.targetMinor)}
                    </Muted>
                  </Row>
                  <ProgressBar
                    value={goal.achievedAt ? goal.targetMinor : Math.max(0, account.balanceMinor)}
                    max={goal.targetMinor}
                    label={`${goal.title}: ${format(Math.max(0, account.balanceMinor))} of ${format(goal.targetMinor)}`}
                  />
                  <Row $justify="between">
                    {goal.achievedAt ? (
                      <StatusText $status="success">
                        Reached {formatDate(goal.achievedAt)}
                      </StatusText>
                    ) : account.balanceMinor >= goal.targetMinor ? (
                      <StatusText $status="success">Enough saved</StatusText>
                    ) : (
                      <Muted as="span">
                        {format(goal.targetMinor - Math.max(0, account.balanceMinor))} to go
                      </Muted>
                    )}
                    <Row $gap={1}>
                      <Button
                        type="button"
                        $variant="ghost"
                        $size="sm"
                        disabled={actions.updateGoal.isPending}
                        onClick={() =>
                          actions.updateGoal.mutate({
                            goalId: goal.id,
                            json: { achieved: !goal.achievedAt },
                          })
                        }
                      >
                        {goal.achievedAt ? 'Not yet' : 'Got it'}
                      </Button>
                      <ConfirmButton
                        message={`Remove the goal “${goal.title}”? The money stays.`}
                        confirmLabel="Yes, remove it"
                        busy={actions.deleteGoal.isPending}
                        onConfirm={() => actions.deleteGoal.mutate(goal.id)}
                      >
                        Remove
                      </ConfirmButton>
                    </Row>
                  </Row>
                </Stack>
              </li>
            ))}
          </List>
        </Stack>

        <Stack $gap={2}>
          <SubTitle>History</SubTitle>
          {account.transactions.length === 0 ? (
            <Muted>Nothing yet.</Muted>
          ) : (
            <List>
              {account.transactions.slice(0, history).map((transaction) => (
                <li key={transaction.id}>
                  <Row $justify="between">
                    <Stack $gap={1}>
                      <Text>{transaction.note ?? POCKET_KIND_LABELS[transaction.kind]}</Text>
                      <Muted as="span">
                        {POCKET_KIND_LABELS[transaction.kind]} · {formatDate(transaction.createdAt)}
                      </Muted>
                    </Stack>
                    <Change $negative={transaction.amountMinor < 0}>
                      {transaction.amountMinor > 0 ? '+' : ''}
                      {format(transaction.amountMinor)}
                    </Change>
                  </Row>
                </li>
              ))}
            </List>
          )}
          {account.transactions.length > history && (
            <Row>
              <Button type="button" $variant="ghost" $size="sm" onClick={() => setHistory(30)}>
                Show more
              </Button>
            </Row>
          )}
        </Stack>
      </Stack>
    </Card>
  )
}

function MoneyForm({
  account,
  digits,
  actions,
  onDone,
}: {
  account: PocketAccount
  digits: number
  actions: PocketActions
  onDone: () => void
}) {
  const [kind, setKind] = useState<'gift' | 'spend'>('gift')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const minor = parseMoney(amount, digits)
    if (!minor) {
      setProblem('Enter an amount.')
      return
    }
    setProblem(null)
    try {
      await actions.addMoney.mutateAsync({
        profileId: account.profileId,
        amountMinor: minor,
        kind,
        note,
      })
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={3} $gap={3}>
          <Select
            label="What"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'gift' | 'spend')}
          >
            <option value="gift">Add money</option>
            <option value="spend">Take out (spent)</option>
          </Select>
          <TextField
            label="Amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={problem ?? undefined}
          />
          <TextField
            label="Note (optional)"
            placeholder={kind === 'gift' ? 'Birthday money' : 'Comic book'}
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
          />
        </Grid>
        {actions.addMoney.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.addMoney.error)}</ErrorText>
        )}
        <Row>
          <Button type="submit" $size="sm" disabled={actions.addMoney.isPending}>
            {actions.addMoney.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

function AllowanceForm({
  account,
  digits,
  actions,
  onDone,
}: {
  account: PocketAccount
  digits: number
  actions: PocketActions
  onDone: () => void
}) {
  const [amount, setAmount] = useState(
    account.allowance ? moneyInput(account.allowance.amountMinor, digits) : '',
  )
  const [weekday, setWeekday] = useState(account.allowance?.weekday ?? 6)
  const [active, setActive] = useState(account.allowance?.active ?? true)
  const [problem, setProblem] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = allowanceInputSchema.safeParse({
      amountMinor: parseMoney(amount, digits) ?? Number.NaN,
      weekday,
      active,
    })
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Enter an amount.')
      return
    }
    setProblem(null)
    try {
      await actions.setAllowance.mutateAsync({ profileId: account.profileId, json: parsed.data })
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={2} $gap={3}>
          <TextField
            label="Each week"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={problem ?? undefined}
          />
          <Select
            label="Paid on"
            value={String(weekday)}
            hint="In the morning, household time."
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {WEEKDAY_LABELS.map((day) => (
              <option key={day.day} value={day.day}>
                {day.long}
              </option>
            ))}
          </Select>
        </Grid>
        <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)}>
          Pay it every week
        </Checkbox>
        {actions.setAllowance.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.setAllowance.error)}</ErrorText>
        )}
        <Row>
          <Button type="submit" $size="sm" disabled={actions.setAllowance.isPending}>
            {actions.setAllowance.isPending ? 'Saving…' : 'Save allowance'}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

function SwapForm({
  account,
  rate,
  format,
  actions,
  onDone,
}: {
  account: PocketAccount
  rate: number
  format: FormatMoney
  actions: PocketActions
  onDone: () => void
}) {
  const [points, setPoints] = useState(String(account.points))
  const count = Number(points)
  const valid = Number.isInteger(count) && count >= 1 && count <= account.points
  const amount = valid ? Math.floor((count * rate) / 100) : 0

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid || amount < 1) return
    try {
      await actions.swapPoints.mutateAsync({ profileId: account.profileId, points: count })
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <TextField
          label="Points to swap"
          type="number"
          inputMode="numeric"
          min={1}
          max={account.points}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          hint={valid ? `Adds ${format(amount)} to their pocket money.` : undefined}
          error={points && !valid ? `Choose between 1 and ${account.points} points.` : undefined}
        />
        {actions.swapPoints.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.swapPoints.error)}</ErrorText>
        )}
        <Row>
          <Button
            type="submit"
            $size="sm"
            disabled={!valid || amount < 1 || actions.swapPoints.isPending}
          >
            {actions.swapPoints.isPending ? 'Swapping…' : 'Swap'}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

function GoalForm({
  account,
  digits,
  actions,
  onDone,
}: {
  account: PocketAccount
  digits: number
  actions: PocketActions
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [errors, setErrors] = useState<{ title?: string; targetMinor?: string }>({})

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = savingsGoalInputSchema.safeParse({
      profileId: account.profileId,
      title,
      targetMinor: parseMoney(target, digits) ?? Number.NaN,
    })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'title' || key === 'targetMinor') next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await actions.addGoal.mutateAsync(parsed.data)
      onDone()
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <Grid $columns={2} $gap={3}>
          <TextField
            label="Saving for"
            placeholder="New bike"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
          />
          <TextField
            label="It costs"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            error={errors.targetMinor}
          />
        </Grid>
        {actions.addGoal.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.addGoal.error)}</ErrorText>
        )}
        <Row>
          <Button type="submit" $size="sm" disabled={actions.addGoal.isPending}>
            {actions.addGoal.isPending ? 'Saving…' : 'Add goal'}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

// One card per child, side by side on wide screens.
const Accounts = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
  align-items: start;
  gap: ${({ theme }) => theme.space[5]}px;
`

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const Balance = styled.p`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ theme }) => theme.fontSizes.xl}px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.text};
`

const SubTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textMuted};
`

const Change = styled.span<{ $negative: boolean }>`
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-variant-numeric: tabular-nums;
  color: ${({ theme, $negative }) => ($negative ? theme.colors.text : theme.colors.success)};
`
