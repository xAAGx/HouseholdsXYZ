import {
  ApiError,
  updatePhoneInputSchema,
  updateProfileInputSchema,
  type AccountDetails,
  type DeletionBlocker,
  type MyProfile,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { toApiError } from '../lib/errors'
import { CITY_EMBED, toPlace } from '../lib/places'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

export const meRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { data, error } = await c.var.supabase
      .from('profiles')
      .select(
        `id, display_name, first_name, last_name, avatar_path, account_type, is_discoverable, city_id,
         city:geo_cities(${CITY_EMBED})`,
      )
      .eq('id', c.var.auth.userId)
      .single()
    if (error) throw toApiError(error)

    const profile: MyProfile = {
      id: data.id,
      displayName: data.display_name,
      firstName: data.first_name,
      lastName: data.last_name,
      avatarPath: data.avatar_path,
      accountType: data.account_type,
      isDiscoverable: data.is_discoverable,
      cityId: data.city_id,
      place: toPlace(data.city),
    }
    return c.json({ profile })
  })

  // Name and home city. Children's profiles are managed by their parents, so
  // the database refuses their own edits (no row comes back).
  .patch('/', zValidator('json', updateProfileInputSchema, validationHook), async (c) => {
    const input = c.req.valid('json')
    const { data, error } = await c.var.supabase
      .from('profiles')
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        display_name: `${input.firstName} ${input.lastName}`,
        city_id: input.cityId,
      })
      .eq('id', c.var.auth.userId)
      .select('id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN', 'Your parents manage your profile.')
    return c.json({ ok: true as const })
  })

  // Date of birth and phone: only ever for the account owner.
  .get('/details', async (c) => {
    const { data, error } = await c.var.supabase
      .from('account_details')
      .select('date_of_birth, phone, phone_verified_at')
      .eq('profile_id', c.var.auth.userId)
      .maybeSingle()
    if (error) throw toApiError(error)
    const details: AccountDetails | null = data && {
      dateOfBirth: data.date_of_birth,
      phone: data.phone,
      phoneVerified: data.phone_verified_at !== null,
    }
    return c.json({ details })
  })

  // A new phone number is unverified again (the database resets it).
  .put('/phone', zValidator('json', updatePhoneInputSchema, validationHook), async (c) => {
    const { data, error } = await c.var.supabase
      .from('account_details')
      .update({ phone: c.req.valid('json').phone })
      .eq('profile_id', c.var.auth.userId)
      .select('profile_id')
      .maybeSingle()
    if (error) throw toApiError(error)
    if (!data) throw new ApiError('FORBIDDEN')
    return c.json({ ok: true as const })
  })

  // "Your data, your exit": everything that's yours, as JSON, read as you
  // (so it can only ever contain what you're allowed to see).
  .get('/export', async (c) => {
    const db = c.var.supabase
    const me = c.var.auth.userId
    const [profile, details, memberships, lists, completions, points, redemptions] =
      await Promise.all([
        db
          .from('profiles')
          .select('display_name, first_name, last_name, account_type, city_id, created_at')
          .eq('id', me)
          .single(),
        db
          .from('account_details')
          .select('date_of_birth, phone, phone_verified_at')
          .eq('profile_id', me)
          .maybeSingle(),
        db
          .from('household_members')
          .select('role, joined_at, household:households!inner(name, slug)')
          .eq('profile_id', me),
        db
          .from('lists')
          .select(
            'title, kind, visibility, created_at, archived_at, items:list_items(text, quantity, note, due_on, done_at)',
          )
          .eq('created_by', me),
        db
          .from('chore_completions')
          .select('period_start, status, points, created_at, chore:chores(title)')
          .eq('completed_by', me),
        db.from('points_ledger').select('delta, reason, note, created_at').eq('profile_id', me),
        db
          .from('reward_redemptions')
          .select('cost, status, created_at, reward:rewards(title)')
          .eq('requested_by', me),
      ])
    for (const result of [profile, details, memberships, lists, completions, points, redemptions]) {
      if (result.error) throw toApiError(result.error)
    }

    c.header('Content-Disposition', 'attachment; filename="households-xyz-export.json"')
    return c.json({
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      accountDetails: details.data,
      households: memberships.data,
      lists: lists.data,
      choresDone: completions.data,
      points: points.data,
      rewardRequests: redemptions.data,
    })
  })

  // Households that must be handed over or deleted before the account can go.
  .get('/deletion', async (c) => {
    const { data, error } = await c.var.supabase.rpc('account_deletion_blockers')
    if (error) throw toApiError(error)
    const blockers: DeletionBlocker[] = data.map((row) => ({
      householdId: row.household_id,
      householdName: row.household_name,
      otherMembers: Number(row.other_members),
    }))
    return c.json({ blockers })
  })

  // Deletes the account for good. The database first checks nothing blocks it
  // and clears what goes with it; then the login is deleted (secret key).
  .delete('/', async (c) => {
    const adminAuth = c.var.adminAuth
    if (!adminAuth) throw new ApiError('UNAVAILABLE', 'Account deletion isn’t set up yet.')

    const { error } = await c.var.supabase.rpc('prepare_account_deletion')
    if (error) {
      if (error.code === '55000') {
        throw new ApiError(
          'CONFLICT',
          'Hand over or delete the households you own first.',
          undefined,
          {
            cause: error,
          },
        )
      }
      throw toApiError(error)
    }

    await adminAuth.deleteAccount(c.var.auth.userId)
    return c.json({ ok: true as const })
  })
