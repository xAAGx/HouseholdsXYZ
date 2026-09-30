import type { HouseholdsSupabaseClient } from '@households/db'
import { isApiErrorBody } from '@households/shared'
import { describe, expect, it } from 'vitest'

import { createApp } from './api'
import { loadConfig } from './config'
import type { ChildAccounts } from './lib/child-accounts'
import type { Logger } from './lib/logger'
import type { SupabaseFactory } from './lib/supabase'
import { MAX_JSON_BODY_BYTES } from './middleware/security'

const USER_ID = '6c1f7f55-4b8a-4d8e-9d0a-2f8a8c3f2b11'
const VALID_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl'
const WEB_ORIGIN = 'http://localhost:5180'

const config = loadConfig({
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_000000',
  CORS_ALLOWED_ORIGINS: WEB_ORIGIN,
})

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} }

// Accepts exactly one token. Data calls are never reached in these tests.
const fakeSupabase: SupabaseFactory = {
  verifier: {
    auth: {
      getClaims: (token: string) =>
        Promise.resolve(
          token === VALID_TOKEN
            ? {
                data: { claims: { sub: USER_ID, role: 'authenticated', aal: 'aal1' } },
                error: null,
              }
            : { data: null, error: new Error('invalid JWT') },
        ),
    },
  } as unknown as HouseholdsSupabaseClient,
  anonymous: {} as HouseholdsSupabaseClient,
  forUser: () => ({}) as HouseholdsSupabaseClient,
}

const VALID_CHILD_CODE = 'K7P4MX2Q'

// Stands in for the secret-key module: one code works, once.
function fakeChildAccounts(): ChildAccounts {
  let used = false
  return {
    create: () => Promise.reject(new Error('not used in these tests')),
    signIn: (code) => {
      if (code !== VALID_CHILD_CODE || used) return Promise.resolve(null)
      used = true
      return Promise.resolve('hashed-token')
    },
    remove: () => Promise.reject(new Error('not used in these tests')),
  }
}

const app = createApp(config, {
  logger: silentLogger,
  supabase: fakeSupabase,
  childAccounts: fakeChildAccounts(),
})
const authed = { Authorization: `Bearer ${VALID_TOKEN}` }

describe('baseline security headers', () => {
  it('are set on every response and caching is disabled', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ignore client-supplied request ids', async () => {
    const res = await app.request('/health', { headers: { 'X-Request-Id': 'forged-id' } })
    expect(res.headers.get('x-request-id')).not.toBe('forged-id')
  })
})

describe('CORS', () => {
  it('allows the configured web origin', async () => {
    const res = await app.request('/v1/me', {
      method: 'OPTIONS',
      headers: { Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('does not allow other origins', async () => {
    const res = await app.request('/v1/me', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('authentication', () => {
  it.each([
    ['no header', {}],
    ['wrong scheme', { Authorization: `Basic ${VALID_TOKEN}` }],
    ['malformed token', { Authorization: 'Bearer not-a-jwt' }],
    ['rejected token', { Authorization: 'Bearer aaa.bbb.ccc' }],
  ])('rejects requests with %s using an identical 401', async (_label, headers) => {
    const res = await app.request('/v1/me', { headers })
    expect(res.status).toBe(401)
    const body: unknown = await res.json()
    expect(isApiErrorBody(body) && body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('input handling', () => {
  it('returns field-level validation errors without echoing input', async () => {
    const res = await app.request('/v1/households', {
      method: 'POST',
      headers: { ...authed, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smiths', slug: 'admin', extra: '<script>' }),
    })
    expect(res.status).toBe(422)
    const text = await res.text()
    expect(text).not.toContain('<script>')
    const body: unknown = JSON.parse(text)
    expect(isApiErrorBody(body) && body.error.issues?.map((i) => i.path)).toEqual(
      expect.arrayContaining(['slug']),
    )
  })

  it('requires a city for new households (addresses are per city)', async () => {
    const res = await app.request('/v1/households', {
      method: 'POST',
      headers: { ...authed, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'The Smiths', slug: 'TheSmiths' }),
    })
    expect(res.status).toBe(422)
    const body: unknown = await res.json()
    expect(isApiErrorBody(body) && body.error.issues?.map((i) => i.path)).toEqual(['cityId'])
  })

  it('rejects oversized bodies', async () => {
    const res = await app.request('/v1/households', {
      method: 'POST',
      headers: { ...authed, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(MAX_JSON_BODY_BYTES), slug: 'smiths' }),
    })
    expect(res.status).toBe(413)
  })

  it('answers unknown routes with the standard error shape', async () => {
    const res = await app.request('/nope')
    expect(res.status).toBe(404)
    expect(isApiErrorBody(await res.json())).toBe(true)
  })
})

describe('child sign-in', () => {
  const signIn = (target: ReturnType<typeof createApp>, code: string, ip = '203.0.113.7') =>
    target.request('/auth/child-sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip },
      body: JSON.stringify({ code }),
    })

  it('exchanges a valid code (typed any way) for a one-time token, once', async () => {
    const local = createApp(config, {
      logger: silentLogger,
      supabase: fakeSupabase,
      childAccounts: fakeChildAccounts(),
    })
    const res = await signIn(local, 'k7p4-mx2q')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tokenHash: 'hashed-token' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect((await signIn(local, VALID_CHILD_CODE)).status).toBe(401)
  })

  it('rejects malformed codes before reaching the database', async () => {
    const res = await signIn(app, 'IO01IO01', '203.0.113.8')
    expect(res.status).toBe(422)
  })

  it('limits attempts per client', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 12; i++)
      statuses.push((await signIn(app, 'ABCDEFGH', '203.0.113.9')).status)
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
  })

  it('is switched off without the secret key', async () => {
    const off = createApp(config, {
      logger: silentLogger,
      supabase: fakeSupabase,
      childAccounts: null,
    })
    expect((await signIn(off, VALID_CHILD_CODE)).status).toBe(503)
  })
})

describe('signed-in only routes', () => {
  it.each([
    ['/v1/invites/preview', { token: 'a'.repeat(64) }],
    ['/v1/invites/accept', { token: 'a'.repeat(64) }],
  ])('%s needs a session', async (path, body) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(401)
  })

  it('invite tokens must be well formed', async () => {
    const res = await app.request('/v1/invites/accept', {
      method: 'POST',
      headers: { ...authed, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-token' }),
    })
    expect(res.status).toBe(422)
  })

  it('household addresses must be well formed', async () => {
    const res = await app.request(
      '/public/households/by-address?country=usa&region=california&city=x&name=Smiths',
    )
    expect(res.status).toBe(422)
  })
})

describe('loadConfig', () => {
  const base = {
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop',
    CORS_ALLOWED_ORIGINS: 'https://households.xyz',
  }

  it('refuses a secret key where the publishable key belongs', () => {
    expect(() =>
      loadConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop' }),
    ).toThrow(/SUPABASE_PUBLISHABLE_KEY/)
  })

  it('refuses wildcard or malformed origins', () => {
    expect(() => loadConfig({ ...base, CORS_ALLOWED_ORIGINS: '*' })).toThrow(/CORS_ALLOWED_ORIGINS/)
    expect(() => loadConfig({ ...base, CORS_ALLOWED_ORIGINS: 'https://households.xyz/' })).toThrow()
  })

  it('requires https in production', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'http://households.xyz',
      }),
    ).toThrow(/https/)
  })

  it('accepts only a real secret key as SUPABASE_SECRET_KEY, and treats empty as unset', () => {
    expect(() =>
      loadConfig({ ...base, SUPABASE_SECRET_KEY: 'sb_publishable_abcdefghijklmnop' }),
    ).toThrow(/SUPABASE_SECRET_KEY/)
    expect(loadConfig({ ...base, SUPABASE_SECRET_KEY: '' }).SUPABASE_SECRET_KEY).toBeUndefined()
    expect(
      loadConfig({ ...base, SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnop' })
        .SUPABASE_SECRET_KEY,
    ).toBe('sb_secret_abcdefghijklmnop')
  })

  it('never includes secret values in error messages', () => {
    const secret = 'sb_secret_supersecretvalue123'
    try {
      loadConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: secret })
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
