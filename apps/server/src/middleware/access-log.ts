import { createMiddleware } from 'hono/factory'
import { routePath } from 'hono/route'

import type { Logger } from '../lib/logger'
import type { AppEnv } from '../types'

/**
 * One line per request, privacy-first: logs the matched route *pattern*
 * (`/v1/households/:id`), never the concrete URL or query string, which can
 * contain household names, search terms or tokens. No IPs, no user agents,
 * no user ids.
 */
export function accessLog(logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const started = performance.now()
    await next()
    logger.info('request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      route: routePath(c, -1),
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    })
  })
}
