import type { ReactNode } from 'react'
import styled from 'styled-components'

import { Card, PageTitle, Stack, Text } from '../ui'
import { container } from '../ui/mixins'
import { AppHeader } from './AppHeader'

/**
 * A focused, single-task screen: the app header, then one outlined card with
 * a title and an optional intro. Used for account screens (sign-up, sign-in,
 * password reset) and onboarding. Account screens stay calm: no playful type,
 * highlights or tilts (DESIGN.md §12).
 */
export function CardPage({
  title,
  intro,
  wide = false,
  children,
}: {
  title: string
  intro?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <>
      <AppHeader />
      <Main $wide={wide}>
        <Card $padding="lg">
          <Stack $gap={5}>
            <Stack $gap={2}>
              <PageTitle>{title}</PageTitle>
              {intro && <Text as="div">{intro}</Text>}
            </Stack>
            {children}
          </Stack>
        </Card>
      </Main>
    </>
  )
}

const Main = styled.main<{ $wide: boolean }>`
  ${container};
  max-width: ${({ $wide }) => ($wide ? 640 : 480)}px;
  padding-top: ${({ theme }) => theme.space[7]}px;
  padding-bottom: ${({ theme }) => theme.space[9]}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    padding-top: ${({ theme }) => theme.space[5]}px;
  }
`
