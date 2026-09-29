import type { MyProfile } from '@households/shared'
import { Hono } from 'hono'

import { toApiError } from '../lib/errors'
import type { AppEnv } from '../types'

export const meRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const { data, error } = await c.var.supabase
    .from('profiles')
    .select('id, display_name, avatar_path, account_type, is_discoverable')
    .eq('id', c.var.auth.userId)
    .single()
  if (error) throw toApiError(error)

  const profile: MyProfile = {
    id: data.id,
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    accountType: data.account_type,
    isDiscoverable: data.is_discoverable,
  }
  return c.json({ profile })
})
