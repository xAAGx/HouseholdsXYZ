import { Suspense } from 'react'
import { Outlet, useRouteError } from 'react-router'
import styled from 'styled-components'

import { AppHeader } from '../components/app/AppHeader'
import { ButtonLink, Page, PageTitle, Stack, Text } from '../components/ui'

export function RootLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  )
}

/** Last-resort error screen. Shows details only in development. */
export function RouteError() {
  const error = useRouteError()
  return (
    <>
      <AppHeader />
      <Page $narrow>
        <Stack $gap={4} $align="start">
          <PageTitle>Something went wrong</PageTitle>
          <Text>Please reload the page. If it keeps happening, let us know.</Text>
          {import.meta.env.DEV && error instanceof Error && <Details>{error.message}</Details>}
          <ButtonLink to="/" $variant="secondary">
            Go home
          </ButtonLink>
        </Stack>
      </Page>
    </>
  )
}

const Details = styled.pre`
  max-width: 100%;
  overflow-x: auto;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
`
