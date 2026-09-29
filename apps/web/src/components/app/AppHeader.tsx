import type { ReactNode } from 'react'
import styled from 'styled-components'

import { Logo } from '../ui'
import { container } from '../ui/mixins'

/** Top bar for app screens: the logo, plus optional actions on the right. */
export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <Bar>
      <Inner>
        <Logo />
        {actions && <Actions>{actions}</Actions>}
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
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  padding-top: 20px;
  padding-bottom: 20px;
`

const Actions = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
`
