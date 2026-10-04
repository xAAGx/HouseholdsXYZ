import type { ReactNode } from 'react'
import styled from 'styled-components'

import { useOptionalAuth } from '../../features/auth/auth-context'
import { NotificationsButton } from '../../features/notifications/NotificationsButton'
import { Logo } from '../ui'
import { container } from '../ui/mixins'

/**
 * Top bar for app screens: the logo, the notifications bell once signed in,
 * plus optional actions on the right.
 */
export function AppHeader({ actions }: { actions?: ReactNode }) {
  const auth = useOptionalAuth()
  const signedIn = auth?.status === 'signed-in' && !auth.needsSecondFactor
  return (
    <Bar>
      <Inner>
        <Logo />
        {(actions || signedIn) && (
          <Actions>
            {actions}
            {signedIn && <NotificationsButton />}
          </Actions>
        )}
      </Inner>
    </Bar>
  )
}

const Bar = styled.header`
  border-bottom: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme }) => theme.colors.hairline};
`

const Inner = styled.div`
  ${container};
  display: flex;
  flex-wrap: wrap; /* never wider than a phone: actions drop below the logo if they must */
  align-items: center;
  column-gap: ${({ theme }) => theme.space[4]}px;
  row-gap: ${({ theme }) => theme.space[2]}px;
  padding-top: 20px;
  padding-bottom: 20px;
`

const Actions = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  min-width: 0;
`
