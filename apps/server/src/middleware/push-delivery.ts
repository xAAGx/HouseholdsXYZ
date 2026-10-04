import { createMiddleware } from 'hono/factory'

import type { Logger } from '../lib/logger'
import { deliverPushes, type PushService } from '../lib/push'
import type { AppEnv } from '../types'

/**
 * After a successful change, sends the pushes it caused (a chore to approve,
 * an item put down for someone, …). The database decides who is told; this
 * only delivers. Waits before replying: serverless functions may stop once
 * the response is sent.
 */
export function pushDelivery(push: PushService | null, logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await next()
    if (!push || c.req.method === 'GET' || c.req.method === 'OPTIONS' || c.res.status >= 400) {
      return
    }
    try {
      await deliverPushes(c.var.supabase, push, logger, c.get('requestId'))
    } catch {
      logger.warn('push delivery crashed', { requestId: c.get('requestId') })
    }
  })
}
