import { ApiError } from '@households/shared'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'

export interface RateLimitStore {
  /** Records a hit for `key` and returns the count in the current window. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>
}

/**
 * Fixed-window counter held in this instance's memory. On Vercel each instance
 * has its own memory, so this is best-effort: it stops one noisy client per
 * instance. Swap in a shared store (Upstash Redis / Vercel KV) implementing
 * RateLimitStore before relying on limits for abuse prevention.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>()
  private lastSweep = 0

  hit(key: string, windowMs: number) {
    const now = Date.now()
    this.sweep(now)
    const current = this.windows.get(key)
    const window =
      current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs }
    window.count += 1
    this.windows.set(key, window)
    return Promise.resolve({ ...window })
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return
    this.lastSweep = now
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}

export interface RateLimitOptions {
  store: RateLimitStore
  limit: number
  windowMs: number
  /** Scope of the limit, e.g. the user id. Namespaced by `name`. */
  key: (c: Context<AppEnv>) => string
  name: string
}

export function rateLimit({ store, limit, windowMs, key, name }: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { count, resetAt } = await store.hit(`${name}:${key(c)}`, windowMs)
    c.header('RateLimit-Limit', String(limit))
    c.header('RateLimit-Remaining', String(Math.max(0, limit - count)))
    if (count > limit) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))))
      throw new ApiError('RATE_LIMITED')
    }
    await next()
  })
}

/**
 * The caller's IP, for rate-limit keys on signed-out routes only. It stays in
 * this instance's memory and is never logged. Vercel sets x-real-ip itself.
 */
export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  )
}
