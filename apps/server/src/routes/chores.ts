import {
  addDays,
  adjustPointsInputSchema,
  ApiError,
  choreBoardQuerySchema,
  chorePeriodStart,
  completeChoreInputSchema,
  createChoreInputSchema,
  createRewardInputSchema,
  reviewInputSchema,
  updateChoreInputSchema,
  updateRewardInputSchema,
  type Chore,
  type ChoreBoard,
  type ChoreCompletion,
} from '@households/shared'
import type { PostgrestError } from '@supabase/supabase-js'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id. Every query runs as the user under RLS;
// points only move through the database functions.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const choreParam = zValidator(
  'param',
  z.object({ id: z.uuid(), choreId: z.uuid() }),
  validationHook,
)
const completionParam = zValidator(
  'param',
  z.object({ id: z.uuid(), completionId: z.uuid() }),
  validationHook,
)
const rewardParam = zValidator(
  'param',
  z.object({ id: z.uuid(), rewardId: z.uuid() }),
  validationHook,
)
const redemptionParam = zValidator(
  'param',
  z.object({ id: z.uuid(), redemptionId: z.uuid() }),
  validationHook,
)

const COMPLETION_FIELDS =
  'id, chore_id, period_start, completed_by, status, points, reviewed_by, created_at'

interface CompletionRow {
  id: string
  chore_id: string
  period_start: string
  completed_by: string
  status: ChoreCompletion['status']
  points: number
  reviewed_by: string | null
  created_at: string
}

const toCompletion = (row: CompletionRow): ChoreCompletion => ({
  id: row.id,
  choreId: row.chore_id,
  periodStart: row.period_start,
  completedBy: row.completed_by,
  status: row.status,
  points: row.points,
  reviewedBy: row.reviewed_by,
  createdAt: row.created_at,
})

/** Turns an RPC's known refusal into a clear message; anything else maps as usual. */
function rpcError(error: PostgrestError, messages: Partial<Record<string, string>>): ApiError {
  const message = messages[error.code]
  if (!message) return toApiError(error)
  const code = error.code === '23505' ? 'CONFLICT' : 'VALIDATION_FAILED'
  return new ApiError(code, message, undefined, { cause: error })
}

const ok = { ok: true as const }

export const choreRoutes = new Hono<AppEnv>()
  // Everything on the chores page for one day (the device's own date).
  .get(
    '/chores',
    householdParam,
    zValidator('query', choreBoardQuerySchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { today } = c.req.valid('query')
      const db = c.var.supabase
      const since = addDays(today, -60)

      const [membership, chores, recent, points, rewards, redemptions, ledger, permissions] =
        await Promise.all([
          db
            .from('household_members')
            .select('role')
            .eq('household_id', id)
            .eq('profile_id', c.var.auth.userId)
            .eq('status', 'active')
            .maybeSingle(),
          db
            .from('chores')
            .select(
              'id, title, notes, points, assigned_to, repeat, due_on, needs_approval, archived_at, created_at',
            )
            .eq('household_id', id)
            .order('created_at', { ascending: true }),
          db
            .from('chore_completions')
            .select(COMPLETION_FIELDS)
            .eq('household_id', id)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1000),
          db.rpc('household_points', { p_household_id: id }),
          db
            .from('rewards')
            .select('id, title, description, cost, archived_at')
            .eq('household_id', id)
            .order('cost', { ascending: true }),
          db
            .from('reward_redemptions')
            .select('id, reward_id, requested_by, cost, status, created_at')
            .eq('household_id', id)
            .order('created_at', { ascending: false })
            .limit(100),
          db
            .from('points_ledger')
            .select(
              'id, profile_id, delta, reason, note, chore_completion_id, redemption_id, created_at',
            )
            .eq('household_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
          db.rpc('my_household_permissions', { p_household_id: id }),
        ])
      for (const result of [
        membership,
        chores,
        recent,
        points,
        rewards,
        redemptions,
        ledger,
        permissions,
      ]) {
        if (result.error) throw toApiError(result.error)
      }
      // Same 404 for "not a member" and "doesn't exist".
      if (!membership.data) throw new ApiError('NOT_FOUND')

      const choreRows = chores.data ?? []
      const completions = (recent.data ?? []).map(toCompletion)

      // One-off chores can be done long ago; fetch theirs whatever the date.
      const onceIds = choreRows.filter((chore) => chore.repeat === 'once').map((chore) => chore.id)
      if (onceIds.length > 0) {
        const { data, error } = await db
          .from('chore_completions')
          .select(COMPLETION_FIELDS)
          .in('chore_id', onceIds)
          .lt('created_at', since)
        if (error) throw toApiError(error)
        completions.push(...data.map(toCompletion))
      }

      const board: ChoreBoard = {
        today,
        chores: choreRows.map((row) => {
          const chore: Chore = {
            id: row.id,
            title: row.title,
            notes: row.notes,
            points: row.points,
            assignedTo: row.assigned_to,
            repeat: row.repeat,
            dueOn: row.due_on,
            needsApproval: row.needs_approval,
            archived: row.archived_at !== null,
            // The database's created_at::date is the UTC date.
            createdOn: row.created_at.slice(0, 10),
          }
          const period = chorePeriodStart(chore.repeat, today, chore.createdOn)
          const inPeriod = completions.filter(
            (completion) => completion.choreId === chore.id && completion.periodStart === period,
          )
          const current =
            inPeriod.find((completion) => completion.status !== 'rejected') ?? inPeriod[0] ?? null
          return { ...chore, current }
        }),
        recent: completions.filter((completion) => completion.createdAt >= since),
        balances: Object.fromEntries(
          (points.data ?? []).map((row) => [row.profile_id, Number(row.balance)]),
        ),
        rewards: (rewards.data ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          cost: row.cost,
          archived: row.archived_at !== null,
        })),
        redemptions: (redemptions.data ?? []).map((row) => ({
          id: row.id,
          rewardId: row.reward_id,
          requestedBy: row.requested_by,
          cost: row.cost,
          status: row.status,
          createdAt: row.created_at,
        })),
        ledger: (ledger.data ?? []).map((row) => ({
          id: row.id,
          profileId: row.profile_id,
          delta: row.delta,
          reason: row.reason,
          note: row.note,
          choreCompletionId: row.chore_completion_id,
          redemptionId: row.redemption_id,
          createdAt: row.created_at,
        })),
        canManage: (permissions.data ?? []).includes('manage_chores'),
      }
      return c.json({ board })
    },
  )

  // ── Chores ───────────────────────────────────────────────────────────────

  .post(
    '/chores',
    householdParam,
    zValidator('json', createChoreInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('chores')
        .insert({
          household_id: id,
          title: input.title,
          notes: input.notes ?? null,
          points: input.points,
          assigned_to: input.assignedTo,
          repeat: input.repeat,
          due_on: input.repeat === 'once' ? (input.dueOn ?? null) : null,
          needs_approval: input.needsApproval,
        })
        .select('id')
        .single()
      if (error) throw toApiError(error)
      return c.json({ chore: { id: data.id } }, 201)
    },
  )

  .patch(
    '/chores/:choreId',
    choreParam,
    zValidator('json', updateChoreInputSchema, validationHook),
    async (c) => {
      const { id, choreId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('chores')
        .update({
          ...(input.title !== undefined && { title: input.title }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.points !== undefined && { points: input.points }),
          ...(input.assignedTo !== undefined && { assigned_to: input.assignedTo }),
          ...(input.repeat !== undefined && { repeat: input.repeat }),
          ...(input.dueOn !== undefined && { due_on: input.dueOn }),
          ...(input.needsApproval !== undefined && { needs_approval: input.needsApproval }),
          ...(input.archived !== undefined && {
            archived_at: input.archived ? new Date().toISOString() : null,
          }),
        })
        .eq('household_id', id)
        .eq('id', choreId)
        .select('id')
        .maybeSingle()
      if (error) throw toApiError(error)
      if (!data) throw new ApiError('FORBIDDEN')
      return c.json(ok)
    },
  )

  .delete('/chores/:choreId', choreParam, async (c) => {
    const { id, choreId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('chores')
      .delete()
      .eq('household_id', id)
      .eq('id', choreId)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json(ok)
  })

  .post(
    '/chores/:choreId/complete',
    choreParam,
    zValidator('json', completeChoreInputSchema, validationHook),
    async (c) => {
      const { choreId } = c.req.valid('param')
      const { data, error } = await c.var.supabase.rpc('complete_chore', {
        p_chore_id: choreId,
        p_today: c.req.valid('json').today,
      })
      if (error) {
        throw rpcError(error, {
          '23505': 'Already done. Nice!',
          '22023': 'Check the date on your device.',
        })
      }
      const done = data[0]
      if (!done) throw new ApiError('INTERNAL')
      return c.json({ completion: { id: done.completion_id, status: done.completion_status } })
    },
  )

  .post(
    '/completions/:completionId/review',
    completionParam,
    zValidator('json', reviewInputSchema, validationHook),
    async (c) => {
      const { completionId } = c.req.valid('param')
      const { error } = await c.var.supabase.rpc('review_chore_completion', {
        p_completion_id: completionId,
        p_approve: c.req.valid('json').approve,
      })
      if (error) throw toApiError(error)
      return c.json(ok)
    },
  )

  .delete('/completions/:completionId', completionParam, async (c) => {
    const { completionId } = c.req.valid('param')
    const { error } = await c.var.supabase.rpc('undo_chore_completion', {
      p_completion_id: completionId,
    })
    if (error) throw toApiError(error)
    return c.json(ok)
  })

  // ── Rewards ──────────────────────────────────────────────────────────────

  .post(
    '/rewards',
    householdParam,
    zValidator('json', createRewardInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('rewards')
        .insert({
          household_id: id,
          title: input.title,
          description: input.description ?? null,
          cost: input.cost,
        })
        .select('id')
        .single()
      if (error) throw toApiError(error)
      return c.json({ reward: { id: data.id } }, 201)
    },
  )

  .patch(
    '/rewards/:rewardId',
    rewardParam,
    zValidator('json', updateRewardInputSchema, validationHook),
    async (c) => {
      const { id, rewardId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('rewards')
        .update({
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.cost !== undefined && { cost: input.cost }),
          ...(input.archived !== undefined && {
            archived_at: input.archived ? new Date().toISOString() : null,
          }),
        })
        .eq('household_id', id)
        .eq('id', rewardId)
        .select('id')
        .maybeSingle()
      if (error) throw toApiError(error)
      if (!data) throw new ApiError('FORBIDDEN')
      return c.json(ok)
    },
  )

  .delete('/rewards/:rewardId', rewardParam, async (c) => {
    const { id, rewardId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('rewards')
      .delete()
      .eq('household_id', id)
      .eq('id', rewardId)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json(ok)
  })

  .post('/rewards/:rewardId/redeem', rewardParam, async (c) => {
    const { rewardId } = c.req.valid('param')
    const { data, error } = await c.var.supabase.rpc('request_reward', { p_reward_id: rewardId })
    if (error) throw rpcError(error, { '22023': 'Not enough points yet.' })
    return c.json({ redemption: { id: data } }, 201)
  })

  .post(
    '/redemptions/:redemptionId/review',
    redemptionParam,
    zValidator('json', reviewInputSchema, validationHook),
    async (c) => {
      const { redemptionId } = c.req.valid('param')
      const { error } = await c.var.supabase.rpc('review_reward_redemption', {
        p_redemption_id: redemptionId,
        p_approve: c.req.valid('json').approve,
      })
      if (error) throw toApiError(error)
      return c.json(ok)
    },
  )

  .delete('/redemptions/:redemptionId', redemptionParam, async (c) => {
    const { redemptionId } = c.req.valid('param')
    const { error } = await c.var.supabase.rpc('cancel_reward_redemption', {
      p_redemption_id: redemptionId,
    })
    if (error) throw toApiError(error)
    return c.json(ok)
  })

  // ── Points ───────────────────────────────────────────────────────────────

  .post(
    '/points',
    householdParam,
    zValidator('json', adjustPointsInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { error } = await c.var.supabase.rpc('adjust_points', {
        p_household_id: id,
        p_profile_id: input.profileId,
        p_delta: input.delta,
        p_note: input.note,
      })
      if (error) throw toApiError(error)
      return c.json(ok)
    },
  )
