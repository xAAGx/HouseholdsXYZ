import { Hono } from 'hono'

import type { AppConfig } from './config'
import { createErrorHandler, notFoundHandler } from './lib/errors'
import { createLogger, type Logger } from './lib/logger'
import { createSupabaseFactory, type SupabaseFactory } from './lib/supabase'
import { accessLog } from './middleware/access-log'
import { requireAuth } from './middleware/auth'
import { MemoryRateLimitStore, rateLimit, type RateLimitStore } from './middleware/rate-limit'
import { assignRequestId } from './middleware/request-id'
import { corsPolicy, jsonBodyLimit, noStore, securityHeaders } from './middleware/security'
import { healthRoutes } from './routes/health'
import { householdRoutes } from './routes/households'
import { meRoutes } from './routes/me'
import type { AppEnv } from './types'

export interface AppDeps {
  logger: Logger
  supabase: SupabaseFactory
  rateLimitStore: RateLimitStore
}

/**
 * Builds the API. Runtime-agnostic: the Node dev server and the Vercel
 * function both call this, and tests inject fakes through `deps`.
 */
export function createApp(config: AppConfig, deps: Partial<AppDeps> = {}) {
  const logger = deps.logger ?? createLogger(config.LOG_LEVEL)
  const supabase = deps.supabase ?? createSupabaseFactory(config)
  const rateLimitStore = deps.rateLimitStore ?? new MemoryRateLimitStore()

  const app = new Hono<AppEnv>()

  app.onError(createErrorHandler(logger))
  app.notFound(notFoundHandler)

  app.use(assignRequestId())
  app.use(accessLog(logger))
  app.use(securityHeaders())
  app.use(noStore())
  app.use(corsPolicy(config))
  app.use(jsonBodyLimit())

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
    .route('/v1/me', meRoutes)
    .route('/v1/households', householdRoutes)
}
