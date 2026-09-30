import { Hono } from 'hono'

import type { AppConfig } from './config'
import { createAdminAuth, type AdminAuth } from './lib/admin-auth'
import { createErrorHandler, notFoundHandler } from './lib/errors'
import { createLogger, type Logger } from './lib/logger'
import { createSupabaseFactory, type SupabaseFactory } from './lib/supabase'
import { accessLog } from './middleware/access-log'
import { requireAuth } from './middleware/auth'
import {
  clientIp,
  MemoryRateLimitStore,
  rateLimit,
  type RateLimitStore,
} from './middleware/rate-limit'
import { assignRequestId } from './middleware/request-id'
import { corsPolicy, jsonBodyLimit, noStore, securityHeaders } from './middleware/security'
import { choreRoutes } from './routes/chores'
import { healthRoutes } from './routes/health'
import { householdRoutes } from './routes/households'
import { inviteRoutes } from './routes/invites'
import { listRoutes } from './routes/lists'
import { meRoutes } from './routes/me'
import { childSignInRoutes, publicHouseholdRoutes } from './routes/public'
import type { AppEnv } from './types'

export interface AppDeps {
  logger: Logger
  supabase: SupabaseFactory
  rateLimitStore: RateLimitStore
  /** Secret-key operations (child logins, deleting your account); null switches them off. */
  adminAuth: AdminAuth | null
}

/**
 * Builds the API. Runtime-agnostic: the Node dev server and the Vercel
 * function both call this, and tests inject fakes through `deps`.
 */
export function createApp(config: AppConfig, deps: Partial<AppDeps> = {}) {
  const logger = deps.logger ?? createLogger(config.LOG_LEVEL)
  const supabase = deps.supabase ?? createSupabaseFactory(config)
  const rateLimitStore = deps.rateLimitStore ?? new MemoryRateLimitStore()
  const adminAuth = deps.adminAuth !== undefined ? deps.adminAuth : createAdminAuth(config)

  const app = new Hono<AppEnv>()

  app.onError(createErrorHandler(logger))
  app.notFound(notFoundHandler)

  app.use(assignRequestId())
  app.use(accessLog(logger))
  app.use(securityHeaders())
  app.use(noStore())
  app.use(corsPolicy(config))
  app.use(jsonBodyLimit())
  app.use(async (c, next) => {
    c.set('adminAuth', adminAuth)
    await next()
  })

  // Signed-out routes, limited per client IP (kept in memory only, never logged).
  app.use(
    '/auth/*',
    rateLimit({ name: 'auth', store: rateLimitStore, limit: 10, windowMs: 60_000, key: clientIp }),
  )
  app.use(
    '/public/*',
    rateLimit({
      name: 'public',
      store: rateLimitStore,
      limit: 120,
      windowMs: 60_000,
      key: clientIp,
    }),
  )

  // Everything under /v1 requires a signed-in user.
  app.use(
    '/v1/*',
    requireAuth(supabase),
    rateLimit({
      name: 'v1',
      store: rateLimitStore,
      limit: 300,
      windowMs: 60_000,
      key: (c) => c.var.auth.userId,
    }),
  )

  return app
    .route('/health', healthRoutes)
    .route('/auth/child-sign-in', childSignInRoutes)
    .route('/public/households', publicHouseholdRoutes(supabase.anonymous))
    .route('/v1/me', meRoutes)
    .route('/v1/households', householdRoutes)
    .route('/v1/households/:id/lists', listRoutes)
    .route('/v1/households/:id', choreRoutes)
    .route('/v1/invites', inviteRoutes)
}
