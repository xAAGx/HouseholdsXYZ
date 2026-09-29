import { ApiError } from '@households/shared'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'

import type { AppConfig } from '../config'
import type { AppEnv } from '../types'

/** JSON bodies only. Files go straight to Supabase Storage via signed upload URLs. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024

/** Locked-down headers for a JSON API: nothing may frame it, embed it or leak referrers. */
export const securityHeaders = () =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
    crossOriginResourcePolicy: 'same-site',
    crossOriginOpenerPolicy: 'same-origin',
    referrerPolicy: 'no-referrer',
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
  })

/** Household data is private: never let browsers, proxies or CDNs cache API responses. */
export const noStore = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

/**
 * Exact-match origin allowlist. We authenticate with bearer tokens, not
 * cookies, so credentials are never allowed cross-origin.
 */
export const corsPolicy = (config: AppConfig) =>
  cors({
    origin: (origin) => (config.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type'],
    exposeHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  })

export const jsonBodyLimit = () =>
  bodyLimit({
    maxSize: MAX_JSON_BODY_BYTES,
    onError: () => {
      throw new ApiError('PAYLOAD_TOO_LARGE')
    },
  })
