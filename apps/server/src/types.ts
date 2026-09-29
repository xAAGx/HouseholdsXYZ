import type { HouseholdsSupabaseClient } from '@households/db'
import type { RequestIdVariables } from 'hono/request-id'

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
  }
}
