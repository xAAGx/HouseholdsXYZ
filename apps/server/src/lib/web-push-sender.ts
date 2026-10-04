// Node-only: web-push uses Node's crypto and https. Imported by the entry
// files only (never from anything app-type.ts reaches), and handed to
// createApp() as a dependency.
import webpush from 'web-push'

import type { AppConfig } from '../config'
import type { PushSender } from './push'

export function createWebPushSender(config: AppConfig): PushSender | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = config
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return null
  const vapidDetails = {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  }

  return {
    async send(subscription, message) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          JSON.stringify(message),
          { vapidDetails, TTL: 24 * 60 * 60, urgency: 'normal', timeout: 5000 },
        )
        return 'sent'
      } catch (error) {
        // The error carries the endpoint: report only what happened.
        const status = (error as { statusCode?: unknown }).statusCode
        return status === 404 || status === 410 ? 'gone' : 'failed'
      }
    },
  }
}
