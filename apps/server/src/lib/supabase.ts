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
  /** For signed-out visitors: the anon role, so RLS shows only public data. */
  readonly anonymous: HouseholdsSupabaseClient
  /** A client acting as the given user, so every query is filtered by RLS. */
  forUser(accessToken: string): HouseholdsSupabaseClient
}

/**
 * Clients that always go through RLS. The only service-role ("admin") client
 * lives in lib/admin-auth.ts, limited to four login operations (see SECURITY.md).
 */
export function createSupabaseFactory(config: AppConfig): SupabaseFactory {
  const base = { url: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY }
  return {
    verifier: createPublicClient({ ...base, options: { auth: statelessAuth } }),
    anonymous: createPublicClient({ ...base, options: { auth: statelessAuth } }),
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
