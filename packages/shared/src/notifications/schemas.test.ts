import { describe, expect, it } from 'vitest'

import { isAllowedPushEndpoint, parseNotificationPath, pushSubscriptionSchema } from './schemas'

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QGx',
  ])('accepts %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://localhost/push',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
  ])('refuses %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false)
  })
})

describe('pushSubscriptionSchema', () => {
  it('accepts what browsers give', () => {
    const result = pushSubscriptionSchema.safeParse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      expirationTime: null,
      keys: {
        p256dh:
          'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('parseNotificationPath', () => {
  const id = '6f1c2a3b-1111-4222-8333-944455556666'

  it('splits the household from the page', () => {
    expect(parseNotificationPath(`/h/${id}/lists/${id}`)).toEqual({
      householdId: id,
      rest: `/lists/${id}`,
    })
    expect(parseNotificationPath(`/h/${id}`)).toEqual({ householdId: id, rest: '' })
  })

  it('refuses anything else', () => {
    expect(parseNotificationPath('https://evil.example/h/x')).toBeNull()
    expect(parseNotificationPath(`/h/${id}/../../evil`)).toBeNull()
    expect(parseNotificationPath(`//evil.example/h/${id}`)).toBeNull()
  })
})
