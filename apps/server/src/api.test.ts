import type { HouseholdsSupabaseClient } from '@households/db'
import { isApiErrorBody, PRIVATE_PUSH_MESSAGE, type PushMessage } from '@households/shared'
import { describe, expect, it } from 'vitest'

import { createApp } from './api'
import { loadConfig } from './config'
import type { AdminAuth } from './lib/admin-auth'
import type { Logger } from './lib/logger'
import { toApiError } from './lib/errors'
import { createPushService, deliverPushes, type PushSender } from './lib/push'
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

// Stands in for the secret-key module: one child code works, once.
function fakeAdminAuth(): AdminAuth {
  let used = false
  const unused = () => Promise.reject(new Error('not used in these tests'))
  return {
    createChild: unused,
    childSignIn: (code) => {
      if (code !== VALID_CHILD_CODE || used) return Promise.resolve(null)
      used = true
      return Promise.resolve('hashed-token')
    },
    removeChild: unused,
    deleteAccount: unused,
  }
}

const app = createApp(config, {
  logger: silentLogger,
  supabase: fakeSupabase,
  adminAuth: fakeAdminAuth(),
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
      adminAuth: fakeAdminAuth(),
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
      adminAuth: null,
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

describe('lists, chores and account routes', () => {
  const HOUSEHOLD = '0d7c4a2e-8f1b-4c3d-9e5f-6a7b8c9d0e1f'
  const json = (method: string, body: unknown) => ({
    method,
    headers: { ...authed, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it.each([
    ['GET', `/v1/households/${HOUSEHOLD}/lists`],
    ['GET', `/v1/households/${HOUSEHOLD}/chores?today=2026-10-01`],
    ['GET', '/v1/me/export'],
    ['DELETE', '/v1/me'],
  ])('%s %s needs a session', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401)
  })

  it('lists never go public', async () => {
    const res = await app.request(
      `/v1/households/${HOUSEHOLD}/lists`,
      json('POST', { title: 'Open', kind: 'todo', visibility: 'public', memberIds: [] }),
    )
    expect(res.status).toBe(422)
  })

  it('chores need whole points and a real date', async () => {
    const chore = await app.request(
      `/v1/households/${HOUSEHOLD}/chores`,
      json('POST', {
        title: 'Dishes',
        points: 1.5,
        assignedTo: null,
        repeat: 'daily',
        needsApproval: true,
      }),
    )
    expect(chore.status).toBe(422)
    const board = await app.request(`/v1/households/${HOUSEHOLD}/chores?today=yesterday`, {
      headers: authed,
    })
    expect(board.status).toBe(422)
  })

  it('add at most 50 list items at once', async () => {
    const res = await app.request(
      `/v1/households/${HOUSEHOLD}/lists/${HOUSEHOLD}/items/bulk`,
      json('POST', { texts: Array.from({ length: 51 }, (_, i) => `Item ${i}`) }),
    )
    expect(res.status).toBe(422)
  })

  it('keep review notes short and turns between distinct people', async () => {
    const review = await app.request(
      `/v1/households/${HOUSEHOLD}/completions/${HOUSEHOLD}/review`,
      json('POST', { approve: false, note: 'x'.repeat(201) }),
    )
    expect(review.status).toBe(422)
    const chore = await app.request(
      `/v1/households/${HOUSEHOLD}/chores`,
      json('POST', {
        title: 'Dishes',
        points: 5,
        assignedTo: null,
        repeat: 'daily',
        needsApproval: true,
        rotation: [HOUSEHOLD, HOUSEHOLD],
      }),
    )
    expect(chore.status).toBe(422)
  })

  it('refuses to delete an account without the secret key configured', async () => {
    const off = createApp(config, { logger: silentLogger, supabase: fakeSupabase, adminAuth: null })
    const res = await off.request('/v1/me', { method: 'DELETE', headers: authed })
    expect(res.status).toBe(503)
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

describe('calendar, meals, notifications and push routes', () => {
  const HOUSEHOLD = '0d7c4a2e-8f1b-4c3d-9e5f-6a7b8c9d0e1f'
  const json = (method: string, body: unknown) => ({
    method,
    headers: { ...authed, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it.each([
    ['GET', `/v1/households/${HOUSEHOLD}/calendar?from=2026-10-01&to=2026-10-31`],
    ['GET', `/v1/households/${HOUSEHOLD}/meals?from=2026-10-05&to=2026-10-11`],
    ['GET', '/v1/notifications'],
    ['GET', '/v1/me/push'],
  ])('%s %s needs a session', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401)
  })

  it('load at most two months of calendar at a time', async () => {
    const res = await app.request(
      `/v1/households/${HOUSEHOLD}/calendar?from=2026-01-01&to=2026-12-31`,
      { headers: authed },
    )
    expect(res.status).toBe(422)
  })

  it('events never go public and need a real time zone', async () => {
    const event = {
      title: 'Dentist',
      startsOn: '2026-10-06',
      timeZone: 'Africa/Cairo',
      repeat: 'none',
      people: [],
      visibility: 'household',
      sharedWith: [],
    }
    const open = await app.request(
      `/v1/households/${HOUSEHOLD}/calendar`,
      json('POST', { ...event, visibility: 'public' }),
    )
    expect(open.status).toBe(422)
    const zone = await app.request(
      `/v1/households/${HOUSEHOLD}/calendar`,
      json('POST', { ...event, timeZone: 'Mars/Olympus' }),
    )
    expect(zone.status).toBe(422)
  })

  it('recipes link only to https pages', async () => {
    const res = await app.request(
      `/v1/households/${HOUSEHOLD}/meals/recipes`,
      json('POST', { title: 'Pilaf', ingredients: [], sourceUrl: 'http://example.com' }),
    )
    expect(res.status).toBe(422)
  })

  it('say push is off when the server has no keys', async () => {
    const res = await app.request('/v1/me/push', { headers: authed })
    expect(await res.json()).toEqual({ available: false, publicKey: null })
    const save = await app.request(
      '/v1/me/push',
      json('PUT', {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
        },
        showDetails: false,
      }),
    )
    expect(save.status).toBe(503)
  })

  it('only accept subscriptions on real push services', async () => {
    const res = await app.request(
      '/v1/me/push',
      json('PUT', {
        subscription: {
          endpoint: 'https://169.254.169.254/latest/meta-data',
          keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
        },
        showDetails: true,
      }),
    )
    expect(res.status).toBe(422)
  })
})

describe('push', () => {
  const pushConfig = loadConfig({
    NODE_ENV: 'test',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_000000',
    CORS_ALLOWED_ORIGINS: WEB_ORIGIN,
    VAPID_PUBLIC_KEY: `B${'A'.repeat(86)}`,
    VAPID_PRIVATE_KEY: 'A'.repeat(43),
    VAPID_SUBJECT: 'mailto:hello@households.xyz',
    PUSH_SEAL_KEY: `${'A'.repeat(43)}=`,
  })
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
  }
  const ALICE = '11111111-1111-4111-8111-111111111111'
  const BOB = '22222222-2222-4222-8222-222222222222'

  const recordingSender = (result: 'sent' | 'gone' = 'sent') => {
    const sent: PushMessage[] = []
    const sender: PushSender = {
      send: (_subscription, message) => {
        sent.push(message)
        return Promise.resolve(result)
      },
    }
    return { sender, sent }
  }

  it('is off unless every key is set', () => {
    expect(() =>
      loadConfig({
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop',
        CORS_ALLOWED_ORIGINS: 'https://households.xyz',
        VAPID_PUBLIC_KEY: `B${'A'.repeat(86)}`,
      }),
    ).toThrow(/VAPID_PUBLIC_KEY/)
    expect(createPushService(config, recordingSender().sender)).toBeNull()
  })

  it('seals subscriptions so only their owner can open them', async () => {
    const push = createPushService(pushConfig, recordingSender().sender)!
    const sealed = await push.seal(ALICE, subscription)
    expect(sealed).not.toContain('fcm.googleapis.com')
    expect(await push.open(ALICE, sealed)).toMatchObject(subscription)
    expect(await push.open(BOB, sealed)).toBeNull()
    expect(await push.open(ALICE, `${sealed.slice(0, -2)}xx`)).toBeNull()
  })

  it('sends private messages unless the device asked for details, and drops gone devices', async () => {
    const { sender, sent } = recordingSender('gone')
    const push = createPushService(pushConfig, sender)!
    const sealed = await push.seal(ALICE, subscription)
    const dropped: unknown[] = []
    const db = {
      rpc: (name: string, args?: unknown) => {
        if (name === 'claim_push_jobs') {
          return Promise.resolve({
            data: [
              {
                subscription_id: 'device-1',
                recipient_id: ALICE,
                sealed,
                show_details: false,
                title: 'Leo finished “Feed the cat”',
                body: 'Approve it or send it back.',
                path: '/h/x/chores',
              },
            ],
            error: null,
          })
        }
        dropped.push(args)
        return Promise.resolve({ data: null, error: null })
      },
    } as unknown as HouseholdsSupabaseClient
    await deliverPushes(db, push, silentLogger, 'request-1')
    expect(sent).toEqual([{ ...PRIVATE_PUSH_MESSAGE, path: '/h/x/chores' }])
    expect(dropped).toEqual([{ p_subscription_ids: ['device-1'] }])
  })

  it('tells the browser its public key when configured', async () => {
    const on = createApp(pushConfig, {
      logger: silentLogger,
      supabase: fakeSupabase,
      adminAuth: null,
      pushSender: recordingSender().sender,
    })
    const res = await on.request('/v1/me/push', { headers: authed })
    expect(await res.json()).toEqual({ available: true, publicKey: `B${'A'.repeat(86)}` })
  })
})

describe('database errors', () => {
  it('say a missing table is "not set up yet" (a migration to push), not a crash', () => {
    for (const code of ['PGRST205', '42P01']) {
      const error = toApiError({
        code,
        message: 'relation "public.events" does not exist',
      } as never)
      expect(error.status).toBe(503)
      expect(error.message).not.toContain('events')
    }
  })
})

describe('meal planning routes', () => {
  const HOUSEHOLD = '0d7c4a2e-8f1b-4c3d-9e5f-6a7b8c9d0e1f'
  const json = (method: string, body: unknown) => ({
    method,
    headers: { ...authed, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const RECIPE_PAGE =
    '<script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeIngredient":["1 onion"]}</script>'

  // Acts as a member who can add recipes.
  const memberSupabase: SupabaseFactory = {
    ...fakeSupabase,
    forUser: () =>
      ({
        rpc: () => Promise.resolve({ data: ['create_posts'], error: null }),
      }) as unknown as HouseholdsSupabaseClient,
  }
  const withPages = (html: string) =>
    createApp(config, {
      logger: silentLogger,
      supabase: memberSupabase,
      adminAuth: null,
      pageFetcher: { fetchHtml: () => Promise.resolve(html) },
    })

  it('import a recipe from a page for the person to check', async () => {
    const res = await withPages(RECIPE_PAGE).request(
      `/v1/households/${HOUSEHOLD}/meals/recipes/import`,
      json('POST', { url: 'https://example.com/soup' }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      draft: {
        title: 'Soup',
        ingredients: ['1 onion'],
        method: null,
        servings: null,
        sourceUrl: 'https://example.com/soup',
      },
    })
  })

  it('only import from https pages that share a recipe', async () => {
    const plain = await withPages(RECIPE_PAGE).request(
      `/v1/households/${HOUSEHOLD}/meals/recipes/import`,
      json('POST', { url: 'http://example.com/soup' }),
    )
    expect(plain.status).toBe(422)
    const none = await withPages('<html></html>').request(
      `/v1/households/${HOUSEHOLD}/meals/recipes/import`,
      json('POST', { url: 'https://example.com/soup' }),
    )
    expect(none.status).toBe(422)
    const off = await app.request(
      `/v1/households/${HOUSEHOLD}/meals/recipes/import`,
      json('POST', { url: 'https://example.com/soup' }),
    )
    expect(off.status).toBe(503)
  })

  it('copy whole weeks and add at least one chosen item', async () => {
    const week = await app.request(
      `/v1/households/${HOUSEHOLD}/meals/copy-week`,
      json('POST', { from: '2026-09-29', to: '2026-10-05' }),
    )
    expect(week.status).toBe(422)
    const shop = await app.request(
      `/v1/households/${HOUSEHOLD}/meals/shopping`,
      json('POST', { listId: HOUSEHOLD, items: [] }),
    )
    expect(shop.status).toBe(422)
  })
})

describe('reminder pushes from the database timer', () => {
  const SECRET = 'r'.repeat(40)
  const timerConfig = loadConfig({
    NODE_ENV: 'test',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_000000',
    CORS_ALLOWED_ORIGINS: WEB_ORIGIN,
    VAPID_PUBLIC_KEY: `B${'A'.repeat(86)}`,
    VAPID_PRIVATE_KEY: 'A'.repeat(43),
    VAPID_SUBJECT: 'mailto:hello@households.xyz',
    PUSH_SEAL_KEY: `${'A'.repeat(43)}=`,
    INTERNAL_PUSH_SECRET: SECRET,
  })
  const ALICE = '11111111-1111-4111-8111-111111111111'
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
  }

  const setup = (result: 'sent' | 'gone', target = timerConfig) => {
    const sent: PushMessage[] = []
    const sender: PushSender = {
      send: (_subscription, message) => {
        sent.push(message)
        return Promise.resolve(result)
      },
    }
    const timerApp = createApp(target, {
      logger: silentLogger,
      supabase: fakeSupabase,
      adminAuth: null,
      pushSender: sender,
    })
    return { timerApp, sent, push: createPushService(target, sender)! }
  }
  const call = (target: ReturnType<typeof createApp>, body: unknown, secret?: string) =>
    target.request('/internal/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret !== undefined && { Authorization: `Bearer ${secret}` }),
      },
      body: JSON.stringify(body),
    })
  const job = (sealed: string, showDetails: boolean) => ({
    subscription_id: '33333333-3333-4333-8333-333333333333',
    recipient_id: ALICE,
    sealed,
    show_details: showDetails,
    title: 'Dentist in 1 hour',
    body: 'Today at 15:00',
    path: '/h/x/calendar',
  })

  it('refuse calls without the shared secret, or when none is set', async () => {
    const { timerApp } = setup('sent')
    expect((await call(timerApp, { jobs: [] })).status).toBe(401)
    expect((await call(timerApp, { jobs: [] }, 'wrong-secret')).status).toBe(401)
    expect((await call(app, { jobs: [] }, SECRET)).status).toBe(401)
  })

  it('send reminders privately unless the device asked for details', async () => {
    const { timerApp, sent, push } = setup('sent')
    const sealed = await push.seal(ALICE, subscription)
    const res = await call(timerApp, { jobs: [job(sealed, false), job(sealed, true)] }, SECRET)
    expect(await res.json()).toEqual({ gone: [] })
    expect(sent).toContainEqual({ ...PRIVATE_PUSH_MESSAGE, path: '/h/x/calendar' })
    expect(sent).toContainEqual({
      title: 'Dentist in 1 hour',
      body: 'Today at 15:00',
      path: '/h/x/calendar',
    })
  })

  it('report devices that are gone or sealed for someone else', async () => {
    const { timerApp, push } = setup('gone')
    const sealed = await push.seal(ALICE, subscription)
    const res = await call(timerApp, { jobs: [job(sealed, false)] }, SECRET)
    expect(await res.json()).toEqual({ gone: ['33333333-3333-4333-8333-333333333333'] })
    const forged = await call(
      setup('sent').timerApp,
      { jobs: [{ ...job(sealed, false), recipient_id: '22222222-2222-4222-8222-222222222222' }] },
      SECRET,
    )
    expect(await forged.json()).toEqual({ gone: ['33333333-3333-4333-8333-333333333333'] })
  })

  it('need a long secret', () => {
    expect(() =>
      loadConfig({
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_000000',
        CORS_ALLOWED_ORIGINS: WEB_ORIGIN,
        INTERNAL_PUSH_SECRET: 'short',
      }),
    ).toThrow(/INTERNAL_PUSH_SECRET/)
  })
})

describe('money, pocket money, chat and vault routes', () => {
  const HOUSEHOLD = '0d7c4a2e-8f1b-4c3d-9e5f-6a7b8c9d0e1f'
  const OTHER = '44444444-4444-4444-8444-444444444444'
  const base = `/v1/households/${HOUSEHOLD}`
  const json = (method: string, body: unknown) => ({
    method,
    headers: { ...authed, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it.each([
    ['GET', `${base}/money?month=2026-10`],
    ['GET', `${base}/pocket`],
    ['GET', `${base}/chat`],
    ['GET', `${base}/documents`],
  ])('%s %s needs a session', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401)
  })

  it('check money amounts and splits before the database sees them', async () => {
    const expense = {
      title: 'Groceries',
      amountMinor: 4250,
      spentOn: '2026-10-04',
      category: 'Groceries',
      paidBy: USER_ID,
      splitBetween: [USER_ID, OTHER],
    }
    for (const bad of [
      { ...expense, amountMinor: 0 },
      { ...expense, amountMinor: 12.5 },
      { ...expense, splitBetween: [OTHER, OTHER] },
      { ...expense, spentOn: '2026-02-30' },
    ]) {
      expect((await app.request(`${base}/money/expenses`, json('POST', bad))).status).toBe(422)
    }
    expect((await app.request(`${base}/money?month=2026-13`, { headers: authed })).status).toBe(422)
  })

  it('only allow the pocket money kinds people can add by hand', async () => {
    const res = await app.request(
      `${base}/pocket/money`,
      json('POST', { profileId: OTHER, amountMinor: 500, kind: 'allowance' }),
    )
    expect(res.status).toBe(422)
  })

  it('keep chat messages within limits', async () => {
    const chat = `${base}/chat/${OTHER}/messages`
    expect((await app.request(chat, json('POST', { body: '   ' }))).status).toBe(422)
    expect((await app.request(chat, json('POST', { body: 'x'.repeat(4001) }))).status).toBe(422)
    const group = await app.request(
      `${base}/chat/groups`,
      json('POST', { title: 'Trip', memberIds: [OTHER, OTHER] }),
    )
    expect(group.status).toBe(422)
  })

  it('keep vault documents off the public and accept only document files', async () => {
    const document = {
      title: 'Passport',
      category: 'Identity',
      people: [],
      expiresOn: '2031-05-01',
      remindDays: 90,
      visibility: 'household',
      sharedWith: [],
    }
    expect(
      (await app.request(`${base}/documents`, json('POST', { ...document, visibility: 'public' })))
        .status,
    ).toBe(422)
    const file = await app.request(
      `${base}/documents/${OTHER}/files`,
      json('POST', {
        storagePath: `${HOUSEHOLD}/documents/${OTHER}/a-file.exe`,
        fileName: 'a-file.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 1000,
      }),
    )
    expect(file.status).toBe(422)
  })
})
