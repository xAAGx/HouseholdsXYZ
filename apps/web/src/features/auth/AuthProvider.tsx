import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setReady(true)
      // Never let one person's household data linger in memory for the next
      // person using this browser.
      if (event === 'SIGNED_OUT') queryClient.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const signOut = useCallback(async () => {
    // 'local' ends this device's session only; offer "sign out everywhere" in settings.
    await supabase.auth.signOut({ scope: 'local' })
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      status: !ready ? 'loading' : session ? 'signed-in' : 'signed-out',
      session,
      signOut,
    }),
    [ready, session, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
