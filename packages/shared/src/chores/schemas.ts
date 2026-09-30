import { Constants, type Enums } from '@households/db'
import { z } from 'zod'

import type { ChoreRepeat } from './periods'

// Chores, points and rewards. The database (chores migration) decides; these
// give forms and the API the same rules.

export type ChoreCompletionStatus = Enums<'chore_completion_status'>
export type RedemptionStatus = Enums<'redemption_status'>
export type PointsReason = Enums<'points_reason'>

export const CHORE_REPEATS = Constants.public.Enums.chore_repeat

export const CHORE_REPEAT_LABELS: Record<ChoreRepeat, string> = {
  once: 'Once',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
}

export const MAX_CHORE_POINTS = 1000
export const MAX_REWARD_COST = 100000
export const MAX_POINTS_ADJUSTMENT = 10000

const dateSchema = z.iso.date({ error: 'Choose a real date.' })

const choreTitleSchema = z
  .string()
  .trim()
  .min(1, 'Name the chore.')
  .max(80, 'Use at most 80 characters.')

const notesSchema = z
  .string()
  .trim()
  .max(500, 'Use at most 500 characters.')
  .transform((value) => value || null)
  .nullable()

const pointsSchema = z
  .number({ error: 'Enter a number of points.' })
  .int('Use whole points.')
  .min(0, 'Points can’t be negative.')
  .max(MAX_CHORE_POINTS, `Use at most ${MAX_CHORE_POINTS} points.`)

export const createChoreInputSchema = z.strictObject({
  title: choreTitleSchema,
  notes: notesSchema.optional(),
  points: pointsSchema,
  /** Null: anyone in the household can do it. */
  assignedTo: z.uuid().nullable(),
  repeat: z.enum(CHORE_REPEATS),
  dueOn: dateSchema.nullable().optional(),
  needsApproval: z.boolean(),
})
export type CreateChoreInput = z.input<typeof createChoreInputSchema>

export const updateChoreInputSchema = z
  .strictObject({
    title: choreTitleSchema.optional(),
    notes: notesSchema.optional(),
    points: pointsSchema.optional(),
    assignedTo: z.uuid().nullable().optional(),
    repeat: z.enum(CHORE_REPEATS).optional(),
    dueOn: dateSchema.nullable().optional(),
    needsApproval: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateChoreInput = z.input<typeof updateChoreInputSchema>

/** The device's own date: chores are about the household's day. */
export const completeChoreInputSchema = z.strictObject({ today: dateSchema })
export const choreBoardQuerySchema = z.object({ today: dateSchema })

export const reviewInputSchema = z.strictObject({ approve: z.boolean() })

const rewardTitleSchema = z
  .string()
  .trim()
  .min(1, 'Name the reward.')
  .max(80, 'Use at most 80 characters.')

const rewardDescriptionSchema = z
  .string()
  .trim()
  .max(300, 'Use at most 300 characters.')
  .transform((value) => value || null)
  .nullable()

const costSchema = z
  .number({ error: 'Enter a number of points.' })
  .int('Use whole points.')
  .min(1, 'A reward costs at least 1 point.')
  .max(MAX_REWARD_COST, `Use at most ${MAX_REWARD_COST.toLocaleString('en')} points.`)

export const createRewardInputSchema = z.strictObject({
  title: rewardTitleSchema,
  description: rewardDescriptionSchema.optional(),
  cost: costSchema,
})
export type CreateRewardInput = z.input<typeof createRewardInputSchema>

export const updateRewardInputSchema = z
  .strictObject({
    title: rewardTitleSchema.optional(),
    description: rewardDescriptionSchema.optional(),
    cost: costSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateRewardInput = z.input<typeof updateRewardInputSchema>

export const adjustPointsInputSchema = z.strictObject({
  profileId: z.uuid(),
  delta: z
    .number({ error: 'Enter a number of points.' })
    .int('Use whole points.')
    .min(-MAX_POINTS_ADJUSTMENT, `Take at most ${MAX_POINTS_ADJUSTMENT.toLocaleString('en')}.`)
    .max(MAX_POINTS_ADJUSTMENT, `Give at most ${MAX_POINTS_ADJUSTMENT.toLocaleString('en')}.`)
    .refine((delta) => delta !== 0, 'Give or take at least 1 point.'),
  note: z.string().trim().min(1, 'Say why.').max(120, 'Use at most 120 characters.'),
})
export type AdjustPointsInput = z.infer<typeof adjustPointsInputSchema>

export interface Chore {
  id: string
  title: string
  notes: string | null
  points: number
  assignedTo: string | null
  repeat: ChoreRepeat
  dueOn: string | null
  needsApproval: boolean
  archived: boolean
  createdOn: string
}

export interface ChoreCompletion {
  id: string
  choreId: string
  periodStart: string
  completedBy: string
  status: ChoreCompletionStatus
  points: number
  reviewedBy: string | null
  createdAt: string
}

export interface Reward {
  id: string
  title: string
  description: string | null
  cost: number
  archived: boolean
}

export interface RewardRedemption {
  id: string
  rewardId: string
  requestedBy: string
  cost: number
  status: RedemptionStatus
  createdAt: string
}

export interface PointsEntry {
  id: number
  profileId: string
  delta: number
  reason: PointsReason
  note: string | null
  choreCompletionId: string | null
  redemptionId: string | null
  createdAt: string
}

/** Everything on the chores page, for one household and one day. */
export interface ChoreBoard {
  today: string
  chores: (Chore & { current: ChoreCompletion | null })[]
  /** Completions from the last 60 days, newest first (for streaks and history). */
  recent: ChoreCompletion[]
  balances: Record<string, number>
  rewards: Reward[]
  redemptions: RewardRedemption[]
  ledger: PointsEntry[]
  canManage: boolean
}
