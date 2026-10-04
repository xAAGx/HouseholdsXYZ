import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { useMyHouseholds } from '../households/queries'
import { setLiveConnected } from './live-status'

// Listens on the household and personal channels (Supabase Realtime, private:
// the database decides who may join). Messages only say what kind of thing
// changed, so this refetches through the API, which applies RLS as usual.

type Scope =
  | 'lists'
  | 'chores'
  | 'calendar'
  | 'meals'
  | 'household'
  | 'notifications'
  | 'money'
  | 'chat'
  | 'documents'

/** What to refetch for a change; householdId is null for personal messages. */
function refresh(queryClient: QueryClient, scope: Scope, householdId: string | null) {
  const keys: (readonly unknown[])[] = []
  const inHousehold = (feature: string) => (householdId ? [feature, householdId] : [feature])
  switch (scope) {
    case 'lists':
      keys.push(inHousehold('lists'), inHousehold('calendar'))
      break
    case 'chores':
      keys.push(inHousehold('chores'), ['households'], inHousehold('calendar'))
      break
    case 'calendar':
      keys.push(inHousehold('calendar'))
      break
    case 'meals':
      keys.push(inHousehold('meals'), inHousehold('calendar'))
      break
    case 'household':
      keys.push(['households'])
      break
    case 'notifications':
      keys.push(['notifications'])
      break
    case 'money':
      keys.push(inHousehold('money'), inHousehold('pocket'))
      break
    case 'chat':
      keys.push(inHousehold('chat'))
      break
    case 'documents':
      keys.push(inHousehold('documents'))
      break
  }
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
}

const SCOPES = new Set<string>([
  'lists',
  'chores',
  'calendar',
  'meals',
  'household',
  'notifications',
  'money',
  'chat',
  'documents',
])

function scopeOf(payload: unknown): Scope | null {
  const scope = (payload as { payload?: { scope?: unknown } } | null)?.payload?.scope
  return typeof scope === 'string' && SCOPES.has(scope) ? (scope as Scope) : null
}

/** Mounted once for signed-in people (in AuthLayout). Renders nothing. */
export function LiveUpdates() {
  const { status, session } = useAuth()
  const signedIn = status === 'signed-in'
  const households = useMyHouseholds(signedIn)
  const queryClient = useQueryClient()
  const me = session?.user.id
  const ids = (households.data ?? []).map((household) => household.id).join(',')

  useEffect(() => {
    if (!signedIn || !me) return
    const topics: [topic: string, householdId: string | null][] = [
      [`profile:${me}`, null],
      ...ids
        .split(',')
        .filter(Boolean)
        .map((id): [string, string] => [`household:${id}`, id]),
    ]
    let cancelled = false
    const joined = new Set<string>()
    const everJoined = new Set<string>()
    const channels = topics.map(([topic, householdId]) =>
      supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, (message) => {
          const scope = scopeOf(message)
          if (scope) refresh(queryClient, scope, householdId)
        }),
    )

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channels.forEach((channel, i) => {
        const [topic, householdId] = topics[i]!
        channel.subscribe((state) => {
          if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            // Back after a dropped connection: catch up on what was missed.
            if (everJoined.has(topic)) {
              for (const scope of SCOPES) refresh(queryClient, scope as Scope, householdId)
            }
            everJoined.add(topic)
            joined.add(topic)
          } else {
            joined.delete(topic)
          }
          setLiveConnected(joined.size === topics.length)
        })
      })
    })

    return () => {
      cancelled = true
      setLiveConnected(false)
      for (const channel of channels) void supabase.removeChannel(channel)
    }
  }, [signedIn, me, ids, queryClient])

  return null
}
