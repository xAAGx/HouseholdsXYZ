import { Hono } from 'hono'

import type { AppConfig } from './config'
import { createAdminAuth, type AdminAuth } from './lib/admin-auth'
import { createErrorHandler, notFoundHandler } from './lib/errors'
import { createLogger, type Logger } from './lib/logger'
import type { PageFetcher } from './lib/pages'
import { createPushService, type PushSender } from './lib/push'
import { createSupabaseFactory, type SupabaseFactory } from './lib/supabase'
import { accessLog } from './middleware/access-log'
import { requireAuth } from './middleware/auth'
import {
  clientIp,
  MemoryRateLimitStore,
  rateLimit,
  type RateLimitStore,
} from './middleware/rate-limit'
import { pushDelivery } from './middleware/push-delivery'
import { assignRequestId } from './middleware/request-id'
import { corsPolicy, jsonBodyLimit, noStore, securityHeaders } from './middleware/security'
import { calendarRoutes } from './routes/calendar'
import { chatRoutes } from './routes/chat'
import { choreRoutes } from './routes/chores'
import { documentRoutes } from './routes/documents'
import { healthRoutes } from './routes/health'
import { householdRoutes } from './routes/households'
import { inviteRoutes } from './routes/invites'
import { listRoutes } from './routes/lists'
import { mealRoutes } from './routes/meals'
import { meRoutes } from './routes/me'
import { moneyRoutes } from './routes/money'
import { notificationRoutes } from './routes/notifications'
import { pocketRoutes } from './routes/pocket'
import { childSignInRoutes, publicHouseholdRoutes } from './routes/public'
import { internalRoutes } from './routes/internal'
import { pushRoutes } from './routes/push'
import type { AppEnv } from './types'

export interface AppDeps {
  logger: Logger
  supabase: SupabaseFactory
  rateLimitStore: RateLimitStore
  /** Secret-key operations (child logins, deleting your account); null switches them off. */
  adminAuth: AdminAuth | null
  /** Sends web pushes (Node-only, lib/web-push-sender.ts); null switches push off. */
  pushSender: PushSender | null
  /** Fetches public pages for recipe import (Node-only, lib/page-fetcher.ts); null switches it off. */
  pageFetcher: PageFetcher | null
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
  const push = createPushService(config, deps.pushSender ?? null)
  const pages = deps.pageFetcher ?? null

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
    c.set('push', push)
    c.set('pages', pages)
    await next()
  })

  // Signed-out routes, limited per client IP (kept in memory only, never logged).
  app.use(
    '/auth/*',
    rateLimit({ name: 'auth', store: rateLimitStore, limit: 10, windowMs: 60_000, key: clientIp }),
  )
  // The database's timer (reminder pushes): few calls, from one place.
  app.use(
    '/internal/*',
    rateLimit({
      name: 'internal',
      store: rateLimitStore,
      limit: 120,
      windowMs: 60_000,
      key: clientIp,
    }),
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
    pushDelivery(push, logger),
  )
  // Recipe import fetches other sites for people: a tighter limit.
  app.use(
    '/v1/households/:id/meals/recipes/import',
    rateLimit({
      name: 'recipe-import',
      store: rateLimitStore,
      limit: 10,
      windowMs: 60_000,
      key: (c) => c.var.auth.userId,
    }),
  )

  return app
    .route('/health', healthRoutes)
    .route('/internal', internalRoutes(config.INTERNAL_PUSH_SECRET ?? null))
    .route('/auth/child-sign-in', childSignInRoutes)
    .route('/public/households', publicHouseholdRoutes(supabase.anonymous))
    .route('/v1/me/push', pushRoutes)
    .route('/v1/me', meRoutes)
    .route('/v1/notifications', notificationRoutes)
    .route('/v1/households', householdRoutes)
    .route('/v1/households/:id/lists', listRoutes)
    .route('/v1/households/:id/calendar', calendarRoutes)
    .route('/v1/households/:id/meals', mealRoutes)
    .route('/v1/households/:id/money', moneyRoutes)
    .route('/v1/households/:id/pocket', pocketRoutes)
    .route('/v1/households/:id/chat', chatRoutes)
    .route('/v1/households/:id/documents', documentRoutes)
    .route('/v1/households/:id', choreRoutes)
    .route('/v1/invites', inviteRoutes)
}
