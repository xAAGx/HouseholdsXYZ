import {
  ApiError,
  householdPath,
  inviteTokenInputSchema,
  type InvitePreview,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { toApiError } from '../lib/errors'
import { CITY_EMBED, toPlace } from '../lib/places'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Invite tokens travel in POST bodies, never in URLs: URLs end up in logs.
export const inviteRoutes = new Hono<AppEnv>()
  .post('/preview', zValidator('json', inviteTokenInputSchema, validationHook), async (c) => {
    const { data, error } = await c.var.supabase.rpc('get_household_invite', {
      p_token: c.req.valid('json').token,
    })
    if (error) throw toApiError(error)
    const row = data[0]
    if (!row) throw new ApiError('NOT_FOUND')

    const invite: InvitePreview = {
      householdName: row.household_name,
      cityName: row.city_name,
      regionName: row.region_name,
      role: row.invite_role,
      invitedBy: row.invited_by,
      expiresAt: row.invite_expires_at,
      alreadyMember: row.already_member,
    }
    return c.json({ invite })
  })

  .post('/accept', zValidator('json', inviteTokenInputSchema, validationHook), async (c) => {
    const { data: householdId, error } = await c.var.supabase.rpc('accept_household_invite', {
      p_token: c.req.valid('json').token,
    })
    if (error) throw toApiError(error)

    const { data: household, error: householdError } = await c.var.supabase
      .from('households')
      .select(`slug, city:geo_cities(${CITY_EMBED})`)
      .eq('id', householdId)
      .single()
    if (householdError) throw toApiError(householdError)
    const place = toPlace(household.city)
    return c.json({ path: place ? householdPath(place, household.slug) : null })
  })
