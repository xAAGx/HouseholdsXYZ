import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  /**
   * Signed in with a password, but two-step sign-in is on and hasn't been
   * passed yet. The database shows such a session nothing, so send the person
   * to /sign-in/verify first.
   */
  needsSecondFactor: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** The auth state, or null outside the signed-in part of the app (e.g. error pages). */
export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext)
}
