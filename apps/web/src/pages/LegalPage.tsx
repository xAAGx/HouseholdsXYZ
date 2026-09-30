import { AppHeader } from '../components/app/AppHeader'
import { Page, PageTitle, Stack, Text } from '../components/ui'

/** Placeholder until the real Terms of Service and Privacy Policy are written. */
export function LegalPage({ title }: { title: string }) {
  return (
    <>
      <AppHeader />
      <Page $narrow>
        <Stack $gap={4}>
          <PageTitle>{title}</PageTitle>
          <Text>
            We’re still writing this. It will be here before Households.xyz opens to everyone.
          </Text>
        </Stack>
      </Page>
    </>
  )
}
