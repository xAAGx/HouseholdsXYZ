import {
  expenseInputSchema,
  localDate,
  moneyInput,
  parseMoney,
  type Expense,
  type ExpenseInput,
  type HouseholdMember,
} from '@households/shared'
import { useState, type FormEvent } from 'react'

import {
  Button,
  ChipButton,
  ChipGroup,
  ErrorText,
  Grid,
  Row,
  Select,
  Stack,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import type { FormatMoney } from './money-format'

interface Fields {
  title: string
  amount: string
  spentOn: string
  category: string
  paidBy: string
  splitBetween: string[]
  notes: string
}

type Errors = Partial<Record<keyof Fields, string>>

/**
 * Adds or edits an expense. Splitting is optional: a household cost (rent,
 * groceries) needn't be, while shared costs between adults show up in "who
 * owes whom", split equally.
 */
export function ExpenseForm({
  expense,
  categories,
  members,
  me,
  digits,
  format,
  busy,
  error,
  onSave,
  onCancel,
}: {
  expense: Expense | null
  categories: string[]
  members: HouseholdMember[]
  me: string
  digits: number
  format: FormatMoney
  busy: boolean
  error: unknown
  onSave: (input: ExpenseInput) => Promise<void>
  onCancel: () => void
}) {
  const [fields, setFields] = useState<Fields>(() => ({
    title: expense?.title ?? '',
    amount: expense ? moneyInput(expense.amountMinor, digits) : '',
    spentOn: expense?.spentOn ?? localDate(),
    category: expense?.category ?? categories[0] ?? 'Other',
    paidBy: expense?.paidBy ?? me,
    splitBetween: expense?.splitBetween ?? [],
    notes: expense?.notes ?? '',
  }))
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }))
  const options = categories.includes(fields.category)
    ? categories
    : [fields.category, ...categories]
  const amount = parseMoney(fields.amount, digits)
  const share =
    amount && fields.splitBetween.length > 0
      ? Math.floor(amount / fields.splitBetween.length)
      : null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const input: ExpenseInput = {
      title: fields.title,
      amountMinor: amount ?? Number.NaN,
      spentOn: fields.spentOn,
      category: fields.category,
      paidBy: fields.paidBy,
      splitBetween: fields.splitBetween,
      notes: fields.notes,
    }
    const parsed = expenseInputSchema.safeParse(input)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'amountMinor' ? 'amount' : (issue.path[0] as keyof Fields)
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSave(input)
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={4}>
        <Grid $columns={2} $gap={4}>
          <TextField
            label="What"
            placeholder="Groceries"
            value={fields.title}
            maxLength={120}
            onChange={(e) => set('title', e.target.value)}
            error={errors.title}
          />
          <TextField
            label="Amount"
            inputMode="decimal"
            placeholder={moneyInput(0, digits)}
            value={fields.amount}
            onChange={(e) => set('amount', e.target.value)}
            error={errors.amount}
          />
          <TextField
            label="Date"
            type="date"
            value={fields.spentOn}
            onChange={(e) => set('spentOn', e.target.value)}
            error={errors.spentOn}
          />
          <Select
            label="Category"
            value={fields.category}
            onChange={(e) => set('category', e.target.value)}
            error={errors.category}
          >
            {options.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <Select
            label="Paid by"
            value={fields.paidBy}
            onChange={(e) => set('paidBy', e.target.value)}
            error={errors.paidBy}
          >
            {members.map((member) => (
              <option key={member.profileId} value={member.profileId}>
                {member.isMe ? `${member.displayName} (you)` : member.displayName}
              </option>
            ))}
          </Select>
          <TextField
            label="Note (optional)"
            value={fields.notes}
            maxLength={300}
            onChange={(e) => set('notes', e.target.value)}
            error={errors.notes}
          />
        </Grid>
        <ChipGroup
          label="Split between (optional)"
          hint={
            share !== null
              ? `${format(share)} each.`
              : 'Leave empty for a household cost. Choose people to keep track of who owes whom.'
          }
          error={errors.splitBetween}
        >
          {members.map((member) => (
            <ChipButton
              key={member.profileId}
              pressed={fields.splitBetween.includes(member.profileId)}
              onClick={() =>
                set(
                  'splitBetween',
                  fields.splitBetween.includes(member.profileId)
                    ? fields.splitBetween.filter((id) => id !== member.profileId)
                    : [...fields.splitBetween, member.profileId],
                )
              }
            >
              {member.displayName}
            </ChipButton>
          ))}
        </ChipGroup>
        {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
        <Row>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : expense ? 'Save' : 'Add expense'}
          </Button>
          <Button type="button" $variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}
