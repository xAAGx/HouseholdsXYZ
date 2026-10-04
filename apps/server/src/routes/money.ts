import {
  ApiError,
  billInputSchema,
  budgetInputSchema,
  EXPENSE_CATEGORIES,
  expenseInputSchema,
  moneyMonthQuerySchema,
  netBalances,
  payBillInputSchema,
  settlementInputSchema,
  settleUp,
  type Bill,
  type BillRepeat,
  type Budget,
  type Expense,
  type MoneyView,
  type SettlementRecord,
} from '@households/shared'
import type { HouseholdsSupabaseClient } from '@households/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/money: shared expenses, settle-ups, budgets
// and bills. RLS shows them only to people who can see money; children get
// the same 404 as outsiders.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const expenseParam = zValidator(
  'param',
  z.object({ id: z.uuid(), expenseId: z.uuid() }),
  validationHook,
)
const settlementParam = zValidator(
  'param',
  z.object({ id: z.uuid(), settlementId: z.uuid() }),
  validationHook,
)
const budgetParam = zValidator(
  'param',
  z.object({ id: z.uuid(), budgetId: z.uuid() }),
  validationHook,
)
const billParam = zValidator('param', z.object({ id: z.uuid(), billId: z.uuid() }), validationHook)

const notFound = () => new ApiError('NOT_FOUND')
const ok = { ok: true as const }

const EXPENSE_FIELDS =
  'id, title, amount_minor, spent_on, category, paid_by, split_between, notes, bill_id'

/** The last day of a "YYYY-MM" month. */
function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

async function permissions(db: HouseholdsSupabaseClient, householdId: string) {
  const { data, error } = await db.rpc('my_household_permissions', { p_household_id: householdId })
  if (error) throw toApiError(error)
  return new Set(data)
}

/** Expects one row changed; otherwise the same 404 for "not yours" and "doesn't exist". */
function changed(result: {
  data: unknown[] | null
  error: Parameters<typeof toApiError>[0] | null
}) {
  if (result.error) throw toApiError(result.error)
  if (!result.data || result.data.length === 0) throw notFound()
}

export const moneyRoutes = new Hono<AppEnv>()
  .get(
    '/',
    householdParam,
    zValidator('query', moneyMonthQuerySchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { month } = c.req.valid('query')
      const db = c.var.supabase
      const can = await permissions(db, id)
      if (!can.has('view_expenses')) throw notFound()

      const from = `${month}-01`
      const to = monthEnd(month)
      const [household, expenses, budgets, bills, settlements, splits, allSettlements, recent] =
        await Promise.all([
          db.from('households').select('currency, currency_digits').eq('id', id).single(),
          db
            .from('expenses')
            .select(EXPENSE_FIELDS)
            .eq('household_id', id)
            .gte('spent_on', from)
            .lte('spent_on', to)
            .order('spent_on', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1000),
          db
            .from('budgets')
            .select('id, category, monthly_minor')
            .eq('household_id', id)
            .order('category'),
          db
            .from('bills')
            .select('id, title, amount_minor, category, repeat, next_due, remind_days, archived_at')
            .eq('household_id', id)
            .order('next_due', { ascending: true }),
          db
            .from('settlements')
            .select('id, from_id, to_id, amount_minor, settled_on, note')
            .eq('household_id', id)
            .order('settled_on', { ascending: false })
            .limit(50),
          db
            .from('expenses')
            .select('amount_minor, paid_by, split_between')
            .eq('household_id', id)
            .filter('split_between', 'neq', '{}')
            .limit(20000),
          db
            .from('settlements')
            .select('from_id, to_id, amount_minor')
            .eq('household_id', id)
            .limit(20000),
          db
            .from('expenses')
            .select('category')
            .eq('household_id', id)
            .order('created_at', { ascending: false })
            .limit(500),
        ])
      for (const result of [
        household,
        expenses,
        budgets,
        bills,
        settlements,
        splits,
        allSettlements,
        recent,
      ]) {
        if (result.error) throw toApiError(result.error)
      }

      const monthExpenses: Expense[] = (expenses.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        amountMinor: row.amount_minor,
        spentOn: row.spent_on,
        category: row.category,
        paidBy: row.paid_by,
        splitBetween: row.split_between,
        notes: row.notes,
        billId: row.bill_id,
      }))
      const spent = new Map<string, number>()
      for (const expense of monthExpenses) {
        const key = expense.category.toLowerCase()
        spent.set(key, (spent.get(key) ?? 0) + expense.amountMinor)
      }
      const net = netBalances(
        (splits.data ?? []).map((row) => ({
          amountMinor: row.amount_minor,
          paidBy: row.paid_by,
          splitBetween: row.split_between,
        })),
        (allSettlements.data ?? []).map((row) => ({
          fromId: row.from_id,
          toId: row.to_id,
          amountMinor: row.amount_minor,
        })),
      )

      const view: MoneyView = {
        month,
        currency: household.data!.currency,
        currencyDigits: household.data!.currency_digits,
        canManage: can.has('manage_expenses'),
        expenses: monthExpenses,
        monthTotalMinor: monthExpenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
        budgets: (budgets.data ?? []).map((row): Budget => ({
          id: row.id,
          category: row.category,
          monthlyMinor: row.monthly_minor,
          spentMinor: spent.get(row.category.toLowerCase()) ?? 0,
        })),
        bills: (bills.data ?? []).map((row): Bill => ({
          id: row.id,
          title: row.title,
          amountMinor: row.amount_minor,
          category: row.category,
          repeat: row.repeat as BillRepeat,
          nextDue: row.next_due,
          remindDays: row.remind_days,
          archived: row.archived_at !== null,
        })),
        settlements: (settlements.data ?? []).map((row): SettlementRecord => ({
          id: row.id,
          fromId: row.from_id,
          toId: row.to_id,
          amountMinor: row.amount_minor,
          settledOn: row.settled_on,
          note: row.note,
        })),
        debts: settleUp(net),
        categories: [
          ...new Set([
            ...EXPENSE_CATEGORIES,
            ...(recent.data ?? []).map((row) => row.category),
            ...(budgets.data ?? []).map((row) => row.category),
          ]),
        ],
      }
      return c.json(view)
    },
  )

  .post(
    '/expenses',
    householdParam,
    zValidator('json', expenseInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('expenses')
        .insert({
          household_id: id,
          title: input.title,
          amount_minor: input.amountMinor,
          spent_on: input.spentOn,
          category: input.category,
          paid_by: input.paidBy,
          split_between: input.splitBetween,
          notes: input.notes ?? null,
        })
        .select('id')
        .single()
      if (error) throw toApiError(error)
      return c.json({ id: data.id }, 201)
    },
  )

  .put(
    '/expenses/:expenseId',
    expenseParam,
    zValidator('json', expenseInputSchema, validationHook),
    async (c) => {
      const { id, expenseId } = c.req.valid('param')
      const input = c.req.valid('json')
      changed(
        await c.var.supabase
          .from('expenses')
          .update({
            title: input.title,
            amount_minor: input.amountMinor,
            spent_on: input.spentOn,
            category: input.category,
            paid_by: input.paidBy,
            split_between: input.splitBetween,
            notes: input.notes ?? null,
          })
          .eq('id', expenseId)
          .eq('household_id', id)
          .select('id'),
      )
      return c.json(ok)
    },
  )

  .delete('/expenses/:expenseId', expenseParam, async (c) => {
    const { id, expenseId } = c.req.valid('param')
    changed(
      await c.var.supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .eq('household_id', id)
        .select('id'),
    )
    return c.json(ok)
  })

  .post(
    '/settlements',
    householdParam,
    zValidator('json', settlementInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.from('settlements').insert({
        household_id: id,
        from_id: input.fromId,
        to_id: input.toId,
        amount_minor: input.amountMinor,
        settled_on: input.settledOn,
        note: input.note ?? null,
      })
      if (error) throw toApiError(error)
      return c.json(ok, 201)
    },
  )

  .delete('/settlements/:settlementId', settlementParam, async (c) => {
    const { id, settlementId } = c.req.valid('param')
    changed(
      await c.var.supabase
        .from('settlements')
        .delete()
        .eq('id', settlementId)
        .eq('household_id', id)
        .select('id'),
    )
    return c.json(ok)
  })

  .post(
    '/budgets',
    householdParam,
    zValidator('json', budgetInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.from('budgets').insert({
        household_id: id,
        category: input.category,
        monthly_minor: input.monthlyMinor,
      })
      if (error) {
        if (error.code === '23505') {
          throw new ApiError('CONFLICT', 'There’s already a budget for that category.', undefined, {
            cause: error,
          })
        }
        throw toApiError(error)
      }
      return c.json(ok, 201)
    },
  )

  .put(
    '/budgets/:budgetId',
    budgetParam,
    zValidator('json', budgetInputSchema, validationHook),
    async (c) => {
      const { id, budgetId } = c.req.valid('param')
      const input = c.req.valid('json')
      changed(
        await c.var.supabase
          .from('budgets')
          .update({ category: input.category, monthly_minor: input.monthlyMinor })
          .eq('id', budgetId)
          .eq('household_id', id)
          .select('id'),
      )
      return c.json(ok)
    },
  )

  .delete('/budgets/:budgetId', budgetParam, async (c) => {
    const { id, budgetId } = c.req.valid('param')
    changed(
      await c.var.supabase
        .from('budgets')
        .delete()
        .eq('id', budgetId)
        .eq('household_id', id)
        .select('id'),
    )
    return c.json(ok)
  })

  .post(
    '/bills',
    householdParam,
    zValidator('json', billInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.from('bills').insert({
        household_id: id,
        title: input.title,
        amount_minor: input.amountMinor,
        category: input.category,
        repeat: input.repeat,
        next_due: input.nextDue,
        remind_days: input.remindDays,
      })
      if (error) throw toApiError(error)
      return c.json(ok, 201)
    },
  )

  .put(
    '/bills/:billId',
    billParam,
    zValidator('json', billInputSchema, validationHook),
    async (c) => {
      const { id, billId } = c.req.valid('param')
      const input = c.req.valid('json')
      changed(
        await c.var.supabase
          .from('bills')
          .update({
            title: input.title,
            amount_minor: input.amountMinor,
            category: input.category,
            repeat: input.repeat,
            next_due: input.nextDue,
            remind_days: input.remindDays,
          })
          .eq('id', billId)
          .eq('household_id', id)
          .select('id'),
      )
      return c.json(ok)
    },
  )

  // Records the payment as an expense and moves the bill to its next date.
  .post(
    '/bills/:billId/pay',
    billParam,
    zValidator('json', payBillInputSchema, validationHook),
    async (c) => {
      const { billId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.rpc('pay_bill', {
        p_bill_id: billId,
        p_amount_minor: input.amountMinor ?? (null as unknown as number),
        p_paid_by: input.paidBy ?? (null as unknown as string),
        p_split_between: input.splitBetween ?? (null as unknown as string[]),
        p_paid_on: input.paidOn ?? (null as unknown as string),
      })
      if (error) {
        if (error.code === '23502' || error.code === '23514') {
          throw new ApiError('VALIDATION_FAILED', 'Enter how much it was.', undefined, {
            cause: error,
          })
        }
        throw toApiError(error)
      }
      return c.json(ok)
    },
  )

  .delete('/bills/:billId', billParam, async (c) => {
    const { id, billId } = c.req.valid('param')
    changed(
      await c.var.supabase
        .from('bills')
        .delete()
        .eq('id', billId)
        .eq('household_id', id)
        .select('id'),
    )
    return c.json(ok)
  })
