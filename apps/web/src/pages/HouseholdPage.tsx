import { countryCodeSchema, householdSlugSchema, placeSlugSchema } from '@households/shared'
import { useParams } from 'react-router'
import { z } from 'zod'

import { AppHeader } from '../components/app/AppHeader'
import { Card, Page, PageTitle, Stack, Text } from '../components/ui'
import { NotFoundPage } from './NotFoundPage'

const addressSchema = z.object({
  country: countryCodeSchema,
  region: placeSlugSchema,
  city: placeSlugSchema,
  name: householdSlugSchema,
})

/**
 * households.xyz/:country/:region/:city/:name. Members will see their
 * household here, and everyone else only a public profile, if the household
 * has published one. Private and nonexistent households must look identical
 * to outsiders.
 */
export function HouseholdPage() {
  const address = addressSchema.safeParse(useParams())
  if (!address.success) return <NotFoundPage />

  return (
    <>
      <AppHeader />
      <Page>
        <Card $padding="lg">
          <Stack $gap={2}>
            <PageTitle>{address.data.name}</PageTitle>
            <Text>Household pages are coming soon.</Text>
          </Stack>
        </Card>
      </Page>
    </>
  )
}
