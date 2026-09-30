import type { HouseholdsSupabaseClient } from '@households/db'
import type { RequestIdVariables } from 'hono/request-id'

import type { AdminAuth } from './lib/admin-auth'

export interface AuthContext {
  userId: string
  sessionId: string | undefined
  /** Authenticator assurance level: 'aal2' once the user has passed MFA. */
  aal: string | undefined
}

export interface AppEnv {
  Variables: RequestIdVariables & {
    /** Set by requireAuth on every /v1 route. */
    auth: AuthContext
    /** Acts as the signed-in user, so every query is filtered by RLS. */
    supabase: HouseholdsSupabaseClient
    /** Secret-key operations (lib/admin-auth.ts); null when switched off. */
    adminAuth: AdminAuth | null
  }
}
