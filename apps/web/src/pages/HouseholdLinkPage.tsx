import { householdPath } from '@households/shared'
import { Navigate, useParams } from 'react-router'

import { AppHeader } from '../components/app/AppHeader'
import { Muted, Page } from '../components/ui'
import { useMyHouseholds } from '../features/households/queries'
import { NotFoundPage } from './NotFoundPage'

const PAGES = new Set(['lists', 'chores', 'calendar', 'meals', 'money', 'chat', 'documents'])

/**
 * /h/<household id>/<page>: links from notifications, which can't know a
 * household's address (it can change). Sends members to the page at the
 * household's current address; everyone else gets "not found".
 */
export function HouseholdLinkPage() {
  const { householdId, page, listId, conversationId } = useParams()
  const rest = listId ? `lists/${listId}` : conversationId ? `chat/${conversationId}` : (page ?? '')
  const households = useMyHouseholds()

  if (households.isPending) {
    return (
      <>
        <AppHeader />
        <Page>
          <Muted>Loading…</Muted>
        </Page>
      </>
    )
  }
  const household = households.data?.find((h) => h.id === householdId)
  if (!household?.place || (page !== undefined && !PAGES.has(page))) return <NotFoundPage />
  const base = householdPath(household.place, household.slug)
  return <Navigate to={rest ? `${base}/${rest}` : base} replace />
}
