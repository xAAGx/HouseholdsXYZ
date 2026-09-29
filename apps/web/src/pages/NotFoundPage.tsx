import { AppHeader } from '../components/app/AppHeader'
import { ButtonLink, Page, PageTitle, Stack, Text } from '../components/ui'

export function NotFoundPage() {
  return (
    <>
      <AppHeader />
      <Page $narrow>
        <Stack $gap={4} $align="start">
          <PageTitle>We couldn’t find that</PageTitle>
          {/* Same message for "doesn't exist" and "private": outsiders can't tell them apart. */}
          <Text>It may not exist, or it may be private.</Text>
          <ButtonLink to="/" $variant="secondary">
            Go home
          </ButtonLink>
        </Stack>
      </Page>
    </>
  )
}
