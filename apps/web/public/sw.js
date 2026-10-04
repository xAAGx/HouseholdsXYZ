// Households.xyz service worker. It only shows push notifications and opens
// the app when one is tapped: no caching, no network handling, no third
// parties. Push messages come from our API, end-to-end encrypted by the
// browser's push service, and carry an in-app path, never a full URL.

const NOTIFICATION_PATH = /^\/h\/[0-9a-f-]{36}(\/[A-Za-z0-9_-]+)*$/

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let message
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = {}
  }
  if (!message || typeof message !== 'object') message = {}
  const title = typeof message.title === 'string' ? message.title.slice(0, 200) : 'Households'
  const body = typeof message.body === 'string' ? message.body.slice(0, 300) : undefined
  const path =
    typeof message.path === 'string' && NOTIFICATION_PATH.test(message.path)
      ? message.path
      : '/notifications'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { path },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.path
  const url = new URL(
    typeof path === 'string' && NOTIFICATION_PATH.test(path) ? path : '/notifications',
    self.location.origin,
  ).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        try {
          await open.navigate(url)
          return
        } catch {
          // Not ours to steer: open a new window instead.
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
