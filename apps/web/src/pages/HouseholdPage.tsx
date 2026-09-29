import { householdSlugSchema } from '@households/shared'
import { useParams } from 'react-router'

import { AppHeader } from '../components/app/AppHeader'
import { Card, Page, PageTitle, Stack, Text } from '../components/ui'
import { NotFoundPage } from './NotFoundPage'

/**
 * households.xyz/house/:slug. Members will see their household here, and
 * everyone else only a public profile, if the household has published one.
 * Private and nonexistent households must look identical to outsiders.
 */
export function HouseholdPage() {
  const params = useParams()
  const slug = householdSlugSchema.safeParse(params.slug)
  if (!slug.success) return <NotFoundPage />

  return (
    <>
      <AppHeader />
      <Page>
        <Card $padding="lg">
          <Stack $gap={2}>
            <PageTitle>{slug.data}</PageTitle>
            <Text>Household pages are coming soon.</Text>
          </Stack>
        </Card>
      </Page>
    </>
  )
}
