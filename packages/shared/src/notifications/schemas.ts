import type { Enums } from '@households/db'
import { z } from 'zod'

// Notifications are written by the database as things happen (see the
// live_updates_notifications migration); people read and clear their own.

export type NotificationKind = Enums<'notification_kind'>

export interface AppNotification {
  id: string
  householdId: string
  kind: NotificationKind
  title: string
  body: string | null
  /** Where tapping it goes: /h/<household id>/<page>, resolved by the app. */
  path: string
  readAt: string | null
  createdAt: string
}

export interface NotificationInbox {
  notifications: AppNotification[]
  unread: number
}

export const markNotificationsReadInputSchema = z.strictObject({
  /** Leave out to mark everything read. */
  ids: z.array(z.uuid()).min(1).max(100).optional(),
})
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadInputSchema>

const NOTIFICATION_PATH = /^\/h\/([0-9a-f-]{36})((?:\/[A-Za-z0-9_-]+)*)$/

/** Splits a notification path into the household and the page inside it ("/lists/…"). */
export function parseNotificationPath(path: string): { householdId: string; rest: string } | null {
  const match = NOTIFICATION_PATH.exec(path)
  if (!match?.[1]) return null
  return { householdId: match[1], rest: match[2] ?? '' }
}

// ── Push ────────────────────────────────────────────────────────────────────

/**
 * The push services browsers use. Subscriptions pointing anywhere else are
 * refused, so the API can never be made to send requests to other hosts.
 */
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Opera, Samsung Internet
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge on Windows
  'push.apple.com', // Safari
] as const

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

const pushEndpointSchema = z
  .string()
  .max(1000)
  .refine(isAllowedPushEndpoint, 'This browser’s push service isn’t supported.')

const base64Url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, 'Not a valid key.')

/** A browser PushSubscription, as PushSubscription.toJSON() gives it. */
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: base64Url(80, 100),
    auth: base64Url(16, 30),
  }),
})
export type PushSubscriptionJson = z.infer<typeof pushSubscriptionSchema>

export const savePushSubscriptionInputSchema = z.strictObject({
  subscription: pushSubscriptionSchema,
  showDetails: z.boolean(),
})
export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionInputSchema>

export const pushEndpointInputSchema = z.strictObject({ endpoint: pushEndpointSchema })

export const updatePushSubscriptionInputSchema = z.strictObject({
  endpoint: pushEndpointSchema,
  showDetails: z.boolean(),
})

/** Whether this server sends push notifications, and its public (VAPID) key. */
export interface PushConfig {
  available: boolean
  publicKey: string | null
}

export interface PushDeviceStatus {
  subscribed: boolean
  showDetails: boolean
}

/** What a push carries to the device's service worker. */
export interface PushMessage {
  title: string
  body: string | null
  path: string
}

/** Shown on devices that keep details off the lock screen (the default). */
export const PRIVATE_PUSH_MESSAGE = {
  title: 'Households',
  body: 'Something new for you. Open the app to see it.',
} as const
