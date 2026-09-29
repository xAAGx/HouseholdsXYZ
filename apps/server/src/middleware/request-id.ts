import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'

/**
 * Tags each request with a fresh random id (returned as X-Request-Id and
 * included in error bodies) so a user-reported error can be matched to logs.
 * Client-supplied ids are ignored: they could be used to forge or pollute logs.
 */
export const assignRequestId = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const id = crypto.randomUUID()
    c.set('requestId', id)
    c.header('X-Request-Id', id)
    await next()
  })
