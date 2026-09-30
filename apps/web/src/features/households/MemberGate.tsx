import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { AppHeader } from '../../components/app/AppHeader'
import { ButtonLink, Muted, Page } from '../../components/ui'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { useAuth } from '../auth/auth-context'
import { useHouseholdAddress, type MemberView } from './member-view'
import { useHouseholdView } from './queries'

/**
 * For pages inside a household (lists, chores): members only. Everyone else
 * gets the same "not found" as for an address that doesn't exist, and an old
 * address sends members to the same page at the new one.
 */
export function MemberGate({
  subPath,
  children,
}: {
  /** The part after the household address, e.g. "/lists". */
  subPath: string
  children: (view: MemberView, basePath: string) => ReactNode
}) {
  const { status } = useAuth()
  const { address, basePath } = useHouseholdAddress()
  const view = useHouseholdView(address, true, status === 'signed-in')

  if (status !== 'signed-in' || view.isPending) {
    return (
      <>
        <AppHeader />
        <Page>
          <Muted>Loading…</Muted>
        </Page>
      </>
    )
  }
  if (view.isError) return <NotFoundPage />
  if (view.data.kind === 'moved') return <Navigate to={`${view.data.path}${subPath}`} replace />
  if (view.data.kind !== 'member') return <NotFoundPage />
  return children(view.data, basePath)
}

/** Header for household sub-pages: back to the household. */
export function HouseholdSubHeader({ view, basePath }: { view: MemberView; basePath: string }) {
  return (
    <AppHeader
      actions={
        <ButtonLink to={basePath} $variant="ghost" $size="sm">
          {view.household.name}
        </ButtonLink>
      }
    />
  )
}
