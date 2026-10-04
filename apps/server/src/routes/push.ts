import {
  ApiError,
  pushEndpointInputSchema,
  savePushSubscriptionInputSchema,
  updatePushSubscriptionInputSchema,
  type PushConfig,
  type PushDeviceStatus,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'

import { toApiError } from '../lib/errors'
import { endpointHash, type PushService } from '../lib/push'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/me/push: this device's push notifications. Subscriptions
// are sealed before they're stored (lib/push.ts); devices are found again by
// a hash of their push endpoint.

function requirePush(c: Context<AppEnv>): PushService {
  const push = c.var.push
  if (!push) throw new ApiError('UNAVAILABLE', 'Notifications aren’t set up on this server yet.')
  return push
}

export const pushRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    const config: PushConfig = {
      available: c.var.push !== null,
      publicKey: c.var.push?.publicKey ?? null,
    }
    return c.json(config)
  })

  // Turns notifications on for this device (or refreshes its subscription).
  .put('/', zValidator('json', savePushSubscriptionInputSchema, validationHook), async (c) => {
    const push = requirePush(c)
    const { subscription, showDetails } = c.req.valid('json')
    const db = c.var.supabase
    const hash = await endpointHash(subscription.endpoint)
    const sealed = await push.seal(c.var.auth.userId, subscription)

    const updated = await db
      .from('push_subscriptions')
      .update({ sealed, show_details: showDetails })
      .eq('endpoint_hash', hash)
      .select('id')
    if (updated.error) throw toApiError(updated.error)
    if (updated.data.length === 0) {
      const { error } = await db
        .from('push_subscriptions')
        .insert({ endpoint_hash: hash, sealed, show_details: showDetails })
      if (error) {
        if (error.code === '54000') {
          throw new ApiError(
            'CONFLICT',
            'Notifications are on for too many devices. Turn them off on one first.',
            undefined,
            { cause: error },
          )
        }
        throw toApiError(error)
      }
    }
    return c.json({ ok: true as const })
  })

  // Whether this device gets notifications, and with details or not.
  .post('/status', zValidator('json', pushEndpointInputSchema, validationHook), async (c) => {
    const hash = await endpointHash(c.req.valid('json').endpoint)
    const { data, error } = await c.var.supabase
      .from('push_subscriptions')
      .select('show_details')
      .eq('endpoint_hash', hash)
      .maybeSingle()
    if (error) throw toApiError(error)
    const status: PushDeviceStatus = {
      subscribed: data !== null,
      showDetails: data?.show_details ?? false,
    }
    return c.json(status)
  })

  .patch('/', zValidator('json', updatePushSubscriptionInputSchema, validationHook), async (c) => {
    const { endpoint, showDetails } = c.req.valid('json')
    const { data, error } = await c.var.supabase
      .from('push_subscriptions')
      .update({ show_details: showDetails })
      .eq('endpoint_hash', await endpointHash(endpoint))
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw new ApiError('NOT_FOUND')
    return c.json({ ok: true as const })
  })

  // Turns notifications off for this device. Works even if push is switched off.
  .post('/remove', zValidator('json', pushEndpointInputSchema, validationHook), async (c) => {
    const { error } = await c.var.supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint_hash', await endpointHash(c.req.valid('json').endpoint))
    if (error) throw toApiError(error)
    return c.json({ ok: true as const })
  })
