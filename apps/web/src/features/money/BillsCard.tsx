import {
  BILL_REPEAT_LABELS,
  BILL_REPEATS,
  billInputSchema,
  localDate,
  moneyInput,
  parseMoney,
  type Bill,
  type BillInput,
  type BillRepeat,
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
  Row,
  Select,
  Stack,
  StatusText,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import { daysBetween, dueText, type FormatMoney } from './money-format'
import type { MoneyActions } from './queries'

const REMIND_OPTIONS = [
  { days: 0, label: 'On the day' },
  { days: 1, label: 'The day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: 'A week before' },
] as const

/**
 * Bills that come round again: when they're due, a reminder before, and
 * "Paid" records the expense and moves the bill to its next date.
 */
export function BillsCard({
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
  const today = localDate()
  const bills = view.bills.filter((bill) => !bill.archived)

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Row $justify="between">
          <CardTitle as="h2">Bills</CardTitle>
          {view.canManage && !adding && (
            <Button type="button" $variant="secondary" $size="sm" onClick={() => setAdding(true)}>
              Add bill
            </Button>
          )}
        </Row>
        {adding && (
          <BillForm
            bill={null}
            categories={view.categories}
            digits={view.currencyDigits}
            busy={actions.addBill.isPending}
            error={actions.addBill.error}
            onSave={async (json) => {
              await actions.addBill.mutateAsync(json)
              setAdding(false)
            }}
            onCancel={() => {
              actions.addBill.reset()
              setAdding(false)
            }}
          />
        )}
        {bills.length === 0 && !adding && (
          <Muted>
            {view.canManage
              ? 'Add rent, phone, insurance or school fees to get a reminder before each is due.'
              : 'No bills yet.'}
          </Muted>
        )}
        <List>
          {bills.map((bill) =>
            editing === bill.id ? (
              <li key={bill.id}>
                <BillForm
                  bill={bill}
                  categories={view.categories}
                  digits={view.currencyDigits}
                  busy={actions.updateBill.isPending}
                  error={actions.updateBill.error}
                  onSave={async (json) => {
                    await actions.updateBill.mutateAsync({ billId: bill.id, json })
                    setEditing(null)
                  }}
                  onCancel={() => {
                    actions.updateBill.reset()
                    setEditing(null)
                  }}
                />
              </li>
            ) : (
              <BillItem
                key={bill.id}
                bill={bill}
                today={today}
                canManage={view.canManage}
                digits={view.currencyDigits}
                format={format}
                actions={actions}
                onEdit={() => setEditing(bill.id)}
              />
            ),
          )}
        </List>
      </Stack>
    </Card>
  )
}

function BillItem({
  bill,
  today,
  canManage,
  digits,
  format,
  actions,
  onEdit,
}: {
  bill: Bill
  today: string
  canManage: boolean
  digits: number
  format: FormatMoney
  actions: MoneyActions
  onEdit: () => void
}) {
  // Bills that vary ask how much it was this time.
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const days = daysBetween(today, bill.nextDue)
  const pay = (amountMinor: number | null) =>
    actions.payBill.mutate(
      { billId: bill.id, json: { amountMinor, paidOn: today } },
      { onSuccess: () => setPaying(false) },
    )

  return (
    <li>
      <Stack $gap={2}>
        <Line>
          <Stack $gap={1}>
            <Title>{bill.title}</Title>
            <Muted as="span">
              {bill.amountMinor === null ? 'Amount varies' : format(bill.amountMinor)} ·{' '}
              {BILL_REPEAT_LABELS[bill.repeat]} · next {formatDay(bill.nextDue)}
            </Muted>
            <StatusText
              $status={days < 0 ? 'danger' : days <= bill.remindDays ? 'warning' : 'success'}
            >
              {dueText(today, bill.nextDue)}
            </StatusText>
          </Stack>
          {canManage && !paying && (
            <Row $gap={1}>
              <Button
                type="button"
                $variant="secondary"
                $size="sm"
                disabled={actions.payBill.isPending}
                onClick={() => (bill.amountMinor === null ? setPaying(true) : pay(null))}
              >
                Paid
              </Button>
              <Button type="button" $variant="ghost" $size="sm" onClick={onEdit}>
                Edit
              </Button>
              <ConfirmButton
                message={`Delete the “${bill.title}” bill? Payments already recorded stay.`}
                confirmLabel="Yes, delete it"
                busy={actions.deleteBill.isPending}
                onConfirm={() => actions.deleteBill.mutate(bill.id)}
              >
                Delete
              </ConfirmButton>
            </Row>
          )}
        </Line>
        {paying && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              const minor = parseMoney(amount, digits)
              if (!minor) {
                setProblem('Enter how much it was.')
                return
              }
              setProblem(null)
              pay(minor)
            }}
          >
            <Row $gap={2}>
              <TextField
                label="How much was it?"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={problem ?? undefined}
              />
              <Button type="submit" $size="sm" disabled={actions.payBill.isPending}>
                Record payment
              </Button>
              <Button type="button" $variant="ghost" $size="sm" onClick={() => setPaying(false)}>
                Cancel
              </Button>
            </Row>
          </form>
        )}
        {actions.payBill.isError && actions.payBill.variables?.billId === bill.id && (
          <ErrorText role="alert">{apiErrorMessage(actions.payBill.error)}</ErrorText>
        )}
      </Stack>
    </li>
  )
}

function BillForm({
  bill,
  categories,
  digits,
  busy,
  error,
  onSave,
  onCancel,
}: {
  bill: Bill | null
  categories: string[]
  digits: number
  busy: boolean
  error: unknown
  onSave: (input: BillInput) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(bill?.title ?? '')
  const [amount, setAmount] = useState(
    bill?.amountMinor ? moneyInput(bill.amountMinor, digits) : '',
  )
  const [category, setCategory] = useState(bill?.category ?? 'Bills')
  const [repeat, setRepeat] = useState<BillRepeat>(bill?.repeat ?? 'monthly')
  const [nextDue, setNextDue] = useState(bill?.nextDue ?? localDate())
  const [remindDays, setRemindDays] = useState(bill?.remindDays ?? 3)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const options = categories.includes(category) ? categories : [category, ...categories]

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const minor = amount.trim() ? parseMoney(amount, digits) : null
    if (amount.trim() && !minor) {
      setErrors({ amountMinor: 'Enter an amount, or leave it empty if it varies.' })
      return
    }
    const parsed = billInputSchema.safeParse({
      title,
      amountMinor: minor,
      category,
      repeat,
      nextDue,
      remindDays,
    })
    if (!parsed.success) {
      const next: Partial<Record<string, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '')
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
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
          <TextField
            label="Bill"
            placeholder="Electricity"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
          />
          <TextField
            label="Amount (optional)"
            inputMode="decimal"
            hint="Leave empty if it varies."
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.amountMinor}
          />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select
            label="How often"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as BillRepeat)}
          >
            {BILL_REPEATS.map((option) => (
              <option key={option} value={option}>
                {BILL_REPEAT_LABELS[option]}
              </option>
            ))}
          </Select>
          <TextField
            label="Next due"
            type="date"
            value={nextDue}
            onChange={(e) => setNextDue(e.target.value)}
            error={errors.nextDue}
          />
          <Select
            label="Remind"
            value={String(remindDays)}
            onChange={(e) => setRemindDays(Number(e.target.value))}
          >
            {REMIND_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </Select>
        </Grid>
        {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
        <Row>
          <Button type="submit" $size="sm" disabled={busy}>
            {busy ? 'Saving…' : bill ? 'Save' : 'Add bill'}
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
