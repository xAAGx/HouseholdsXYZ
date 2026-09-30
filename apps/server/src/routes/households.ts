import { createHouseholdInputSchema, type HouseholdSummary } from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { toApiError } from '../lib/errors'
import { CITY_EMBED, toPlace } from '../lib/places'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

const HOUSEHOLD_SUMMARY = `role, household:households!inner(
  id, slug, name, visibility, avatar_path, city:geo_cities(${CITY_EMBED})
)`

export const householdRoutes = new Hono<AppEnv>()
  // Households the signed-in user is an active member of.
  .get('/', async (c) => {
    const { data, error } = await c.var.supabase
      .from('household_members')
      .select(HOUSEHOLD_SUMMARY)
      .eq('profile_id', c.var.auth.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
    if (error) throw toApiError(error)

    const households: HouseholdSummary[] = data.map(({ role, household }) => ({
      id: household.id,
      slug: household.slug,
      name: household.name,
      visibility: household.visibility,
      avatarPath: household.avatar_path,
      myRole: role,
      place: toPlace(household.city),
    }))
    return c.json({ households })
  })

  // Creates a private household owned by the caller. Validation is repeated in
  // the database (create_household RPC), which is the final authority.
  .post('/', zValidator('json', createHouseholdInputSchema, validationHook), async (c) => {
    const input = c.req.valid('json')
    const { data: id, error } = await c.var.supabase.rpc('create_household', {
      p_name: input.name,
      p_slug: input.slug,
      p_city_id: input.cityId,
    })
    if (error) throw toApiError(error)

    const { data: city, error: cityError } = await c.var.supabase
      .from('geo_cities')
      .select(CITY_EMBED)
      .eq('id', input.cityId)
      .single()
    if (cityError) throw toApiError(cityError)

    return c.json(
      { household: { id, slug: input.slug, name: input.name, place: toPlace(city) } },
      201,
    )
  })
