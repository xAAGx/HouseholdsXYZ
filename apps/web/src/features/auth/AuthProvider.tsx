import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { supabase } from '../../lib/supabase'
import { forgetThisDevice } from '../notifications/push'
import { AuthContext, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Never let one person's household data linger in memory for the next
      // person using this browser.
      if (event === 'SIGNED_OUT') queryClient.clear()
      if (!nextSession) {
        setSession(null)
        setNeedsSecondFactor(false)
        setReady(true)
        return
      }
      // Supabase asks not to call it from inside this callback, so defer.
      setTimeout(() => {
        void supabase.auth.mfa
          .getAuthenticatorAssuranceLevel()
          // If the check itself fails, don't lock the app: the database still
          // refuses a session that skipped the second step.
          .catch(() => ({ data: null }))
          .then(({ data: level }) => {
            setNeedsSecondFactor(level?.nextLevel === 'aal2' && level.currentLevel !== 'aal2')
            setSession(nextSession)
            setReady(true)
          })
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const signOut = useCallback(async () => {
    // The next person on this device mustn't get your notifications.
    await forgetThisDevice().catch(() => undefined)
    // 'local' ends this device's session only; offer "sign out everywhere" in settings.
    await supabase.auth.signOut({ scope: 'local' })
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      status: !ready ? 'loading' : session ? 'signed-in' : 'signed-out',
      session,
      needsSecondFactor,
      signOut,
    }),
    [ready, session, needsSecondFactor, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
