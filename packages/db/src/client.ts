import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js'

import type { Database } from './database.types'
import { assertPublishableKey } from './keys'

export type HouseholdsSupabaseClient = SupabaseClient<Database>

export interface PublicClientConfig {
  url: string
  publishableKey: string
  options?: SupabaseClientOptions<'public'>
}

/**
 * Supabase client for end-user contexts (web, mobile, and per-request clients
 * on the server). Always uses the publishable key, so every query is subject
 * to Row Level Security as the signed-in user.
 */
export function createPublicClient({
  url,
  publishableKey,
  options,
}: PublicClientConfig): HouseholdsSupabaseClient {
  assertPublishableKey(publishableKey)
  return createClient<Database>(url, publishableKey, {
    ...options,
    auth: {
      // PKCE: auth codes are bound to the device that started the flow, so an
      // intercepted redirect is useless to an attacker.
      flowType: 'pkce',
      ...options?.auth,
    },
  })
}
