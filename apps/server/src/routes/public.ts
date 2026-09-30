import { ApiError, childSignInInputSchema, householdAddressSchema } from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { loadHouseholdView } from '../lib/household-view'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

/** For signed-out visitors: public household profiles only, via the anon role. */
export function publicHouseholdRoutes(anonymous: Parameters<typeof loadHouseholdView>[0]) {
  return new Hono<AppEnv>().get(
    '/by-address',
    zValidator('query', householdAddressSchema, validationHook),
    async (c) => {
      const view = await loadHouseholdView(anonymous, null, c.req.valid('query'))
      if (!view) throw new ApiError('NOT_FOUND')
      return c.json({ view })
    },
  )
}

/**
 * A child types the one-time code a parent showed them. On success they get a
 * one-time token hash, which the web app exchanges for a session with
 * supabase.auth.verifyOtp. Wrong, used and expired codes all fail the same way.
 */
export const childSignInRoutes = new Hono<AppEnv>().post(
  '/',
  zValidator('json', childSignInInputSchema, validationHook),
  async (c) => {
    const adminAuth = c.var.adminAuth
    if (!adminAuth) throw new ApiError('UNAVAILABLE', 'Child sign-in isn’t set up yet.')
    const tokenHash = await adminAuth.childSignIn(c.req.valid('json').code)
    if (!tokenHash) {
      throw new ApiError('UNAUTHENTICATED', 'That code didn’t work. Ask a parent for a new one.')
    }
    return c.json({ tokenHash })
  },
)
