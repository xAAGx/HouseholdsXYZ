import type { Database } from '@households/db'
import { ApiError } from '@households/shared'
import { createClient } from '@supabase/supabase-js'

import type { AppConfig } from '../config'
import { toApiError } from './errors'

/**
 * The only code that holds the Supabase secret key (service role), which
 * bypasses Row Level Security. It does four things, and nothing else:
 *   1. create a child's login (the database checks the parent may),
 *   2. turn a child's one-time sign-in code into a one-time sign-in token,
 *   3. delete a child's login,
 *   4. delete the signed-in person's own login (after the database has
 *      checked nothing blocks it).
 * Approved by the project owner: 1-3 on 2026-09-30, 4 on 2026-10-01
 * (SECURITY.md). Lint stops every other file from importing this module or
 * creating Supabase clients. Routes must authorize the caller (as themselves,
 * under RLS) before calling it.
 */

/** Child logins never receive email. `.invalid` can never resolve (RFC 2606). */
const CHILD_EMAIL_DOMAIN = 'children.households.invalid'

export interface AdminAuth {
  /** Creates a child login in the household and returns its id. */
  createChild(input: {
    parentId: string
    householdId: string
    displayName: string
  }): Promise<string>
  /** Uses up a child's sign-in code. Returns a token hash for verifyOtp, or null. */
  childSignIn(code: string): Promise<string | null>
  /** Deletes a child's login; their profile and memberships go with it. */
  removeChild(childId: string): Promise<void>
  /** Deletes the caller's own login, once prepare_account_deletion() has run. */
  deleteAccount(userId: string): Promise<void>
}

/** Null when SUPABASE_SECRET_KEY isn't set: these features are then switched off. */
export function createAdminAuth(config: AppConfig): AdminAuth | null {
  const secretKey = config.SUPABASE_SECRET_KEY
  if (!secretKey) return null

  const admin = createClient<Database>(config.SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const authFailure = (cause: unknown) => new ApiError('INTERNAL', undefined, undefined, { cause })

  const deleteUser = async (userId: string) => {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw authFailure(error)
  }

  return {
    async createChild({ parentId, householdId, displayName }) {
      // The database checks the parent's permission and returns a one-time
      // secret; the new-user trigger turns it into a child profile + membership.
      const { data: secret, error } = await admin.rpc('begin_child_account', {
        p_parent_id: parentId,
        p_household_id: householdId,
        p_display_name: displayName,
      })
      if (error) throw toApiError(error)

      const { data, error: createError } = await admin.auth.admin.createUser({
        email: `child-${crypto.randomUUID()}@${CHILD_EMAIL_DOMAIN}`,
        email_confirm: true,
        user_metadata: { child_setup: secret },
      })
      if (createError) throw authFailure(createError)
      return data.user.id
    },

    async childSignIn(code) {
      const { data: childId, error } = await admin.rpc('redeem_child_sign_in_code', {
        p_code: code,
      })
      if (error) throw toApiError(error)
      if (!childId) return null

      const { data: found, error: userError } = await admin.auth.admin.getUserById(childId)
      if (userError || !found.user.email) throw authFailure(userError)

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: found.user.email,
      })
      if (linkError) throw authFailure(linkError)
      return link.properties.hashed_token
    },

    removeChild: deleteUser,
    deleteAccount: deleteUser,
  }
}
