import type { Enums } from '@households/db'
import { z } from 'zod'

import type { Debt } from './balances'

// Money: shared expenses, settle-ups, budgets, bills and pocket money. The
// database (money migration) is the authority on who sees and changes what.
// Amounts are whole minor units (cents) of the household's currency.

export const EXPENSE_CATEGORIES = [
  'Groceries',
  'Eating out',
  'Home',
  'Bills',
  'Transport',
  'Kids',
  'School',
  'Health',
  'Fun',
  'Gifts',
  'Holidays',
  'Other',
] as const

export const BILL_REPEATS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
export type BillRepeat = (typeof BILL_REPEATS)[number]
export const BILL_REPEAT_LABELS: Record<BillRepeat, string> = {
  weekly: 'Every week',
  monthly: 'Every month',
  quarterly: 'Every three months',
  yearly: 'Every year',
}

export type PocketKind = Enums<'pocket_kind'>
export const POCKET_KIND_LABELS: Record<PocketKind, string> = {
  allowance: 'Allowance',
  gift: 'Gift',
  spend: 'Spent',
  points: 'Points swapped',
  adjustment: 'Correction',
}

const dateSchema = z.iso.date({ error: 'Choose a real date.' })
const amountSchema = z
  .number({ error: 'Enter an amount.' })
  .int('Enter an amount.')
  .min(1, 'Enter an amount.')
  .max(100_000_000_000, 'That’s too much.')
const categorySchema = z.string().trim().min(1, 'Choose a category.').max(40)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)
    .nullable()
const peopleSchema = z
  .array(z.uuid())
  .max(20, 'Choose up to 20 people.')
  .refine((ids) => new Set(ids).size === ids.length, 'Choose each person once.')

export const expenseInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Say what it was.').max(120),
  amountMinor: amountSchema,
  spentOn: dateSchema,
  category: categorySchema,
  paidBy: z.uuid({ error: 'Choose who paid.' }),
  /** Shared equally between these people; empty: a household cost, not split. */
  splitBetween: peopleSchema,
  notes: optionalText(300).optional(),
})
export type ExpenseInput = z.input<typeof expenseInputSchema>

export const settlementInputSchema = z
  .strictObject({
    fromId: z.uuid(),
    toId: z.uuid(),
    amountMinor: amountSchema,
    settledOn: dateSchema,
    note: optionalText(120).optional(),
  })
  .refine((input) => input.fromId !== input.toId, {
    path: ['toId'],
    message: 'Choose two different people.',
  })
export type SettlementInput = z.input<typeof settlementInputSchema>

export const budgetInputSchema = z.strictObject({
  category: categorySchema,
  monthlyMinor: amountSchema,
})
export type BudgetInput = z.input<typeof budgetInputSchema>

export const billInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Name the bill.').max(80),
  /** Null when it varies. */
  amountMinor: amountSchema.nullable(),
  category: categorySchema,
  repeat: z.enum(BILL_REPEATS),
  nextDue: dateSchema,
  remindDays: z.number().int().min(0).max(30),
})
export type BillInput = z.input<typeof billInputSchema>

export const payBillInputSchema = z.strictObject({
  amountMinor: amountSchema.nullable().optional(),
  paidBy: z.uuid().optional(),
  splitBetween: peopleSchema.optional(),
  paidOn: dateSchema.optional(),
})
export type PayBillInput = z.input<typeof payBillInputSchema>

export const pocketMoneyInputSchema = z.strictObject({
  profileId: z.uuid(),
  amountMinor: z.number().int().min(1, 'Enter an amount.').max(1_000_000_000),
  kind: z.enum(['gift', 'spend', 'adjustment']),
  note: optionalText(120).optional(),
})
export type PocketMoneyInput = z.input<typeof pocketMoneyInputSchema>

export const swapPointsInputSchema = z.strictObject({
  profileId: z.uuid(),
  points: z.number().int().min(1, 'Choose how many points.').max(1_000_000),
})

export const allowanceInputSchema = z.strictObject({
  amountMinor: z.number().int().min(1, 'Enter an amount.').max(100_000_000),
  /** ISO weekday it's paid on (1 = Monday). */
  weekday: z.number().int().min(1).max(7),
  active: z.boolean(),
})
export type AllowanceInput = z.input<typeof allowanceInputSchema>

export const savingsGoalInputSchema = z.strictObject({
  profileId: z.uuid(),
  title: z.string().trim().min(1, 'Name the goal.').max(80),
  targetMinor: z.number().int().min(1, 'Enter an amount.').max(1_000_000_000),
})
export type SavingsGoalInput = z.input<typeof savingsGoalInputSchema>

export const moneyMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month.'),
})

export interface Expense {
  id: string
  title: string
  amountMinor: number
  spentOn: string
  category: string
  paidBy: string | null
  splitBetween: string[]
  notes: string | null
  billId: string | null
}

export interface SettlementRecord {
  id: string
  fromId: string | null
  toId: string | null
  amountMinor: number
  settledOn: string
  note: string | null
}

export interface Budget {
  id: string
  category: string
  monthlyMinor: number
  /** Spent in this category in the month shown. */
  spentMinor: number
}

export interface Bill {
  id: string
  title: string
  amountMinor: number | null
  category: string
  repeat: BillRepeat
  nextDue: string
  remindDays: number
  archived: boolean
}

export interface MoneyView {
  month: string
  currency: string
  currencyDigits: number
  canManage: boolean
  /** This month's expenses, newest first. */
  expenses: Expense[]
  monthTotalMinor: number
  budgets: Budget[]
  bills: Bill[]
  settlements: SettlementRecord[]
  /** Who owes whom overall, as the fewest payments. */
  debts: Debt[]
  /** Categories used before, for picking. */
  categories: string[]
}

export interface PocketTransaction {
  id: number
  amountMinor: number
  kind: PocketKind
  note: string | null
  createdAt: string
  createdBy: string | null
}

export interface SavingsGoal {
  id: string
  title: string
  targetMinor: number
  achievedAt: string | null
}

export interface PocketAccount {
  profileId: string
  balanceMinor: number
  transactions: PocketTransaction[]
  allowance: {
    amountMinor: number
    weekday: number
    active: boolean
    lastPaidOn: string | null
  } | null
  goals: SavingsGoal[]
  /** Chore points they have now. */
  points: number
}

export interface PocketView {
  currency: string
  currencyDigits: number
  /** What 100 points are worth (minor units); null: points don't turn into money. */
  pointsValueMinor: number | null
  canManage: boolean
  accounts: PocketAccount[]
}
