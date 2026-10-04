import {
  markNotificationsReadInputSchema,
  type AppNotification,
  type NotificationInbox,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/notifications. The database writes notifications; people
// read theirs (RLS: only their own, from households they're still in).

const FIELDS = 'id, household_id, kind, title, body, path, read_at, created_at'

export const notificationRoutes = new Hono<AppEnv>()
  // The latest 50, and how many are unread.
  .get('/', async (c) => {
    const db = c.var.supabase
    const me = c.var.auth.userId
    const [list, unread] = await Promise.all([
      db
        .from('notifications')
        .select(FIELDS)
        .eq('recipient_id', me)
        .order('created_at', { ascending: false })
        .limit(50),
      db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', me)
        .is('read_at', null),
    ])
    if (list.error) throw toApiError(list.error)
    if (unread.error) throw toApiError(unread.error)

    const notifications: AppNotification[] = list.data.map((row) => ({
      id: row.id,
      householdId: row.household_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      path: row.path,
      readAt: row.read_at,
      createdAt: row.created_at,
    }))
    const inbox: NotificationInbox = { notifications, unread: unread.count ?? 0 }
    return c.json(inbox)
  })

  // Marks some (or all) as read.
  .post(
    '/read',
    zValidator('json', markNotificationsReadInputSchema, validationHook),
    async (c) => {
      const { ids } = c.req.valid('json')
      let query = c.var.supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', c.var.auth.userId)
        .is('read_at', null)
      if (ids) query = query.in('id', ids)
      const { error } = await query
      if (error) throw toApiError(error)
      return c.json({ ok: true as const })
    },
  )
