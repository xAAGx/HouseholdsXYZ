import { ApiError } from '@households/shared'
import { createMiddleware } from 'hono/factory'

import type { SupabaseFactory } from '../lib/supabase'
import type { AppEnv } from '../types'

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/
const MAX_TOKEN_LENGTH = 8 * 1024

/**
 * Verifies the Supabase access token (signature, expiry, issuer) and exposes a
 * per-request Supabase client that acts as that user. Every failure mode gives
 * the same 401, so callers learn nothing about why a token was rejected.
 */
export function requireAuth(supabase: SupabaseFactory) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1]
    if (!token || token.length > MAX_TOKEN_LENGTH) throw new ApiError('UNAUTHENTICATED')

    // Checks the signature locally against the project's JWKS (asymmetric keys),
    // falling back to the Auth server for legacy symmetric keys.
    const { data, error } = await supabase.verifier.auth.getClaims(token)
    const claims = data?.claims
    if (
      error ||
      !claims ||
      claims.role !== 'authenticated' ||
      typeof claims.sub !== 'string' ||
      claims.is_anonymous === true
    ) {
      throw new ApiError('UNAUTHENTICATED')
    }

    c.set('auth', {
      userId: claims.sub,
      sessionId: typeof claims.session_id === 'string' ? claims.session_id : undefined,
      aal: typeof claims.aal === 'string' ? claims.aal : undefined,
    })
    c.set('supabase', supabase.forUser(token))
    await next()
  })
}
