import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { Muted, Page } from '../../components/ui'
import { useAuth } from './auth-context'

/** Gate for signed-in areas. The real protection is RLS + API auth; this is UX. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <Page $narrow>
        <Muted>Loading…</Muted>
      </Page>
    )
  }

  if (status === 'signed-out') {
    const returnTo = location.pathname + location.search
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return children
}
