import type { MyProfile } from '@households/shared'
import { Hono } from 'hono'

import { toApiError } from '../lib/errors'
import { CITY_EMBED, toPlace } from '../lib/places'
import type { AppEnv } from '../types'

export const meRoutes = new Hono<AppEnv>().get('/', async (c) => {
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
