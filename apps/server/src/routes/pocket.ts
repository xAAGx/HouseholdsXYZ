import {
  allowanceInputSchema,
  ApiError,
  pocketMoneyInputSchema,
  savingsGoalInputSchema,
  swapPointsInputSchema,
  type PocketAccount,
  type PocketView,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/pocket. Children see their own pocket money;
// people who manage money see and change everyone's (never their own). RLS
// decides what each person gets back.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const profileParam = zValidator(
  'param',
  z.object({ id: z.uuid(), profileId: z.uuid() }),
  validationHook,
)
const goalParam = zValidator('param', z.object({ id: z.uuid(), goalId: z.uuid() }), validationHook)

const ok = { ok: true as const }
const notFound = () => new ApiError('NOT_FOUND')

const updateGoalSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(80).optional(),
    targetMinor: z.number().int().min(1).max(1_000_000_000).optional(),
    achieved: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })

export const pocketRoutes = new Hono<AppEnv>()
  .get('/', householdParam, async (c) => {
    const { id } = c.req.valid('param')
    const db = c.var.supabase
    const me = c.var.auth.userId

    const [household, members, permissions, transactions, allowances, goals, points] =
      await Promise.all([
        db
          .from('households')
          .select('currency, currency_digits, points_value_minor')
          .eq('id', id)
          .maybeSingle(),
        db
          .from('household_members')
          .select('profile_id, role')
          .eq('household_id', id)
          .eq('status', 'active'),
        db.rpc('my_household_permissions', { p_household_id: id }),
        db
          .from('pocket_transactions')
          .select('id, profile_id, amount_minor, kind, note, created_at, created_by')
          .eq('household_id', id)
          .order('created_at', { ascending: false })
          .limit(5000),
        db
          .from('pocket_allowances')
          .select('profile_id, amount_minor, weekday, active, last_paid_on')
          .eq('household_id', id),
        db
          .from('savings_goals')
          .select('id, profile_id, title, target_minor, achieved_at')
          .eq('household_id', id)
          .order('created_at', { ascending: true }),
        db.rpc('household_points', { p_household_id: id }),
      ])
    for (const result of [
      household,
      members,
      permissions,
      transactions,
      allowances,
      goals,
      points,
    ]) {
      if (result.error) throw toApiError(result.error)
    }
    if (!household.data) throw notFound()

    const canManage = (permissions.data ?? []).includes('manage_expenses')
    const rows = transactions.data ?? []
    const owners = new Set([
      ...rows.map((row) => row.profile_id),
      ...(allowances.data ?? []).map((row) => row.profile_id),
      ...(goals.data ?? []).map((row) => row.profile_id),
    ])
    // Managers see every child's and teen's account (and anyone with pocket
    // money); everyone else sees only their own.
    const profiles = canManage
      ? (members.data ?? [])
          .filter(
            (member) =>
              member.profile_id !== me &&
              (member.role === 'child' || member.role === 'teen' || owners.has(member.profile_id)),
          )
          .map((member) => member.profile_id)
      : [me]
    const pointsOf = new Map(
      (points.data ?? []).map((row) => [row.profile_id, Number(row.balance)]),
    )

    const accounts: PocketAccount[] = profiles.map((profileId) => {
      const mine = rows.filter((row) => row.profile_id === profileId)
      const allowance = (allowances.data ?? []).find((row) => row.profile_id === profileId)
      return {
        profileId,
        balanceMinor: mine.reduce((sum, row) => sum + row.amount_minor, 0),
        transactions: mine.slice(0, 30).map((row) => ({
          id: row.id,
          amountMinor: row.amount_minor,
          kind: row.kind,
          note: row.note,
          createdAt: row.created_at,
          createdBy: row.created_by,
        })),
        allowance: allowance
          ? {
              amountMinor: allowance.amount_minor,
              weekday: allowance.weekday,
              active: allowance.active,
              lastPaidOn: allowance.last_paid_on,
            }
          : null,
        goals: (goals.data ?? [])
          .filter((row) => row.profile_id === profileId)
          .map((row) => ({
            id: row.id,
            title: row.title,
            targetMinor: row.target_minor,
            achievedAt: row.achieved_at,
          })),
        points: pointsOf.get(profileId) ?? 0,
      }
    })

    const view: PocketView = {
      currency: household.data.currency,
      currencyDigits: household.data.currency_digits,
      pointsValueMinor: household.data.points_value_minor,
      canManage,
      accounts,
    }
    return c.json(view)
  })

  // Gifts, spending and corrections (people who manage money).
  .post(
    '/money',
    householdParam,
    zValidator('json', pocketMoneyInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.rpc('add_pocket_money', {
        p_household_id: id,
        p_profile_id: input.profileId,
        p_amount_minor: input.amountMinor,
        p_kind: input.kind,
        p_note: input.note ?? '',
      })
      if (error) {
        if (error.code === '22023') {
          throw new ApiError(
            'VALIDATION_FAILED',
            'There isn’t that much pocket money.',
            undefined,
            {
              cause: error,
            },
          )
        }
        throw toApiError(error)
      }
      return c.json(ok, 201)
    },
  )

  // Points into pocket money, at the household's rate.
  .post(
    '/swap',
    householdParam,
    zValidator('json', swapPointsInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase.rpc('swap_points_for_money', {
        p_household_id: id,
        p_profile_id: input.profileId,
        p_points: input.points,
      })
      if (error) {
        if (error.code === '22023') {
          throw new ApiError(
            'VALIDATION_FAILED',
            'That can’t be swapped: check the points they have and what points are worth.',
            undefined,
            { cause: error },
          )
        }
        throw toApiError(error)
      }
      return c.json({ amountMinor: Number(data) })
    },
  )

  .put(
    '/allowances/:profileId',
    profileParam,
    zValidator('json', allowanceInputSchema, validationHook),
    async (c) => {
      const { id, profileId } = c.req.valid('param')
      const input = c.req.valid('json')
      const db = c.var.supabase
      const updated = await db
        .from('pocket_allowances')
        .update({ amount_minor: input.amountMinor, weekday: input.weekday, active: input.active })
        .eq('household_id', id)
        .eq('profile_id', profileId)
        .select('profile_id')
      if (updated.error) throw toApiError(updated.error)
      if (updated.data.length === 0) {
        const { error } = await db.from('pocket_allowances').insert({
          household_id: id,
          profile_id: profileId,
          amount_minor: input.amountMinor,
          weekday: input.weekday,
          active: input.active,
        })
        if (error) throw toApiError(error)
      }
      return c.json(ok)
    },
  )

  .delete('/allowances/:profileId', profileParam, async (c) => {
    const { id, profileId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('pocket_allowances')
      .delete()
      .eq('household_id', id)
      .eq('profile_id', profileId)
      .select('profile_id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json(ok)
  })

  .post(
    '/goals',
    householdParam,
    zValidator('json', savingsGoalInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.from('savings_goals').insert({
        household_id: id,
        profile_id: input.profileId,
        title: input.title,
        target_minor: input.targetMinor,
      })
      if (error) throw toApiError(error)
      return c.json(ok, 201)
    },
  )

  .patch(
    '/goals/:goalId',
    goalParam,
    zValidator('json', updateGoalSchema, validationHook),
    async (c) => {
      const { id, goalId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('savings_goals')
        .update({
          ...(input.title !== undefined && { title: input.title }),
          ...(input.targetMinor !== undefined && { target_minor: input.targetMinor }),
          ...(input.achieved !== undefined && {
            achieved_at: input.achieved ? new Date().toISOString() : null,
          }),
        })
        .eq('id', goalId)
        .eq('household_id', id)
        .select('id')
      if (error) throw toApiError(error)
      if (data.length === 0) throw notFound()
      return c.json(ok)
    },
  )

  .delete('/goals/:goalId', goalParam, async (c) => {
    const { id, goalId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('savings_goals')
      .delete()
      .eq('id', goalId)
      .eq('household_id', id)
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json(ok)
  })
