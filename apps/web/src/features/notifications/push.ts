import { unwrap } from '@households/api-client'
import { pushSubscriptionSchema, type PushSubscriptionJson } from '@households/shared'

import { api } from '../../lib/api'

// This browser's side of push notifications: the service worker
// (public/sw.js) and the push subscription. Nothing is sent anywhere but our
// API and the browser's own push service.

export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

export function pushSupport(): PushSupport {
  const capable =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (capable) return 'supported'
  // iPhone and iPad offer push only to apps added to the Home Screen.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'needs-install' : 'unsupported'
}

export function pushPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied'
}

function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The subscription as our API takes it, or null if the browser gave something odd. */
export function subscriptionJson(subscription: PushSubscription): PushSubscriptionJson | null {
  const parsed = pushSubscriptionSchema.safeParse(subscription.toJSON())
  return parsed.success ? parsed.data : null
}

/** This browser's current push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration ? registration.pushManager.getSubscription() : null
}

export class PushBlockedError extends Error {
  constructor() {
    super('Notifications are blocked for this site.')
  }
}

/** Asks permission (if needed) and subscribes this browser. */
export async function subscribeThisDevice(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushBlockedError()
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  })
}

/**
 * Turns notifications off for this browser: forgets it on our side, then
 * unsubscribes. Also used when signing out, so the next person on a shared
 * device doesn't get your notifications.
 */
export async function forgetThisDevice(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  try {
    await unwrap(api.v1.me.push.remove.$post({ json: { endpoint: subscription.endpoint } }))
  } finally {
    await subscription.unsubscribe()
  }
}
