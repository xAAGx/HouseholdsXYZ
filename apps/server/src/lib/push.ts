import type { HouseholdsSupabaseClient } from '@households/db'
import {
  isAllowedPushEndpoint,
  PRIVATE_PUSH_MESSAGE,
  pushSubscriptionSchema,
  type PushMessage,
  type PushSubscriptionJson,
} from '@households/shared'

import type { AppConfig } from '../config'
import type { Logger } from './logger'

// Push notifications. Reachable from app-type.ts, so Web Crypto only (no
// Node globals); the Node-only sender lives in lib/web-push-sender.ts.

/** Sends one push to one browser. */
export interface PushSender {
  send(
    subscription: PushSubscriptionJson,
    message: PushMessage,
  ): Promise<'sent' | 'gone' | 'failed'>
}

export interface PushService {
  /** The VAPID public key browsers subscribe with. */
  publicKey: string
  /** Encrypts a subscription for storage, bound to its owner. */
  seal(profileId: string, subscription: PushSubscriptionJson): Promise<string>
  /** Opens a sealed subscription; null if it isn't this owner's or can't be read. */
  open(profileId: string, sealed: string): Promise<PushSubscriptionJson | null>
  sender: PushSender
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** SHA-256 of a push endpoint, hex: how a device's row is found again. */
export async function endpointHash(endpoint: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(endpoint)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Push, if this server is configured for it (see config.ts); otherwise null. */
export function createPushService(
  config: AppConfig,
  sender: PushSender | null,
): PushService | null {
  if (!sender || !config.VAPID_PUBLIC_KEY || !config.PUSH_SEAL_KEY) return null
  const sealKey = config.PUSH_SEAL_KEY
  let key: ReturnType<typeof crypto.subtle.importKey> | undefined
  const getKey = () =>
    (key ??= crypto.subtle.importKey('raw', fromBase64(sealKey), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]))

  return {
    publicKey: config.VAPID_PUBLIC_KEY,
    sender,
    async seal(profileId, subscription) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const plain = encoder.encode(
        JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys }),
      )
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(profileId) },
        await getKey(),
        plain,
      )
      return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
    },
    async open(profileId, sealed) {
      const [version, iv, data, extra] = sealed.split('.')
      if (version !== 'v1' || !iv || !data || extra !== undefined) return null
      try {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(iv), additionalData: encoder.encode(profileId) },
          await getKey(),
          fromBase64(data),
        )
        const parsed = pushSubscriptionSchema.safeParse(JSON.parse(decoder.decode(plain)))
        return parsed.success ? parsed.data : null
      } catch {
        return null
      }
    },
  }
}

/**
 * Sends the pushes the caller's own request just caused. Called after a
 * successful change; never throws, and logs no content or addresses.
 */
export async function deliverPushes(
  db: HouseholdsSupabaseClient,
  push: PushService,
  logger: Logger,
  requestId: string,
): Promise<void> {
  const { data: jobs, error } = await db.rpc('claim_push_jobs')
  if (error) {
    logger.warn('push claim failed', { requestId, code: error.code })
    return
  }
  if (jobs.length === 0) return

  const gone: string[] = []
  let failed = 0
  await Promise.all(
    jobs.map(async (job) => {
      const subscription = await push.open(job.recipient_id, job.sealed)
      if (!subscription || !isAllowedPushEndpoint(subscription.endpoint)) {
        gone.push(job.subscription_id)
        return
      }
      const message: PushMessage = job.show_details
        ? { title: job.title, body: job.body, path: job.path }
        : { ...PRIVATE_PUSH_MESSAGE, path: job.path }
      const result = await push.sender.send(subscription, message)
      if (result === 'gone') gone.push(job.subscription_id)
      if (result === 'failed') failed++
    }),
  )

  if (gone.length > 0) {
    const { error: dropError } = await db.rpc('drop_gone_push_subscriptions', {
      p_subscription_ids: gone,
    })
    if (dropError) logger.warn('push cleanup failed', { requestId, code: dropError.code })
  }
  if (failed > 0) logger.warn('push delivery failed', { requestId, failed, sent: jobs.length })
}
