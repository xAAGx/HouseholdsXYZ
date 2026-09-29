import { createPublicClient, type HouseholdsSupabaseClient } from '@households/db'

import type { AppConfig } from '../config'

// The server never persists or refreshes sessions: each request brings its own token.
const statelessAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const

export interface SupabaseFactory {
  /** Verifies access tokens. Holds no user session and is never used for data. */
  readonly verifier: HouseholdsSupabaseClient
  /** A client acting as the given user, so every query is filtered by RLS. */
  forUser(accessToken: string): HouseholdsSupabaseClient
}

/**
 * There is deliberately no service-role ("admin") client here. Adding one is a
 * security-review decision: it bypasses RLS, so it must live in a dedicated
 * module, be used only for narrowly scoped jobs, and never for user requests.
 */
export function createSupabaseFactory(config: AppConfig): SupabaseFactory {
  const base = { url: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY }
  return {
    verifier: createPublicClient({ ...base, options: { auth: statelessAuth } }),
    forUser: (accessToken) =>
      createPublicClient({
        ...base,
        options: {
          auth: statelessAuth,
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        },
      }),
  }
}
