import {
  ApiError,
  isAllowedPushEndpoint,
  PRIVATE_PUSH_MESSAGE,
  type PushMessage,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /internal. Called by the database's timer (pg_net) with pushes
// for reminders and allowances, which have no user request to ride on. Signed
// with INTERNAL_PUSH_SECRET (also in Supabase Vault). Subscriptions arrive
// sealed and are opened here, exactly like pushes after a user's change.

const jobSchema = z.object({
  subscription_id: z.uuid(),
  recipient_id: z.uuid(),
  sealed: z.string().max(4000),
  show_details: z.boolean(),
  title: z.string().max(200),
  body: z.string().max(300).nullable(),
  path: z.string().max(300),
})

const pushBodySchema = z.object({ jobs: z.array(jobSchema).max(500) })

const encoder = new TextEncoder()

/** Compares secrets without leaking where they differ (or their length). */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!
  return diff === 0
}

async function requireSecret(c: Context<AppEnv>, secret: string | null) {
  const given = /^Bearer (.+)$/.exec(c.req.header('Authorization') ?? '')?.[1] ?? ''
  if (!secret || !(await sameSecret(given, secret))) throw new ApiError('UNAUTHENTICATED')
}

export function internalRoutes(secret: string | null) {
  return new Hono<AppEnv>().post(
    '/push',
    async (c, next) => {
      await requireSecret(c, secret)
      await next()
    },
    zValidator('json', pushBodySchema, validationHook),
    async (c) => {
      const push = c.var.push
      if (!push) throw new ApiError('UNAVAILABLE')
      const gone: string[] = []
      await Promise.all(
        c.req.valid('json').jobs.map(async (job) => {
          const subscription = await push.open(job.recipient_id, job.sealed)
          if (!subscription || !isAllowedPushEndpoint(subscription.endpoint)) {
            gone.push(job.subscription_id)
            return
          }
          const message: PushMessage = job.show_details
            ? { title: job.title, body: job.body, path: job.path }
            : { ...PRIVATE_PUSH_MESSAGE, path: job.path }
          if ((await push.sender.send(subscription, message)) === 'gone') {
            gone.push(job.subscription_id)
          }
        }),
      )
      return c.json({ gone })
    },
  )
}
