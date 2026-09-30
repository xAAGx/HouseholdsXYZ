import type { ReactNode } from 'react'
import styled from 'styled-components'

import { Stack } from './layout'

/**
 * A titled group of related fields inside a form ("Where you live"). A real
 * fieldset + legend, so screen readers announce the group with each field.
 */
export function FieldGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <Fieldset>
      <Legend>{legend}</Legend>
      <Stack $gap={4}>{children}</Stack>
    </Fieldset>
  )
}

const Fieldset = styled.fieldset`
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
`

const Legend = styled.legend`
  margin-bottom: ${({ theme }) => theme.space[3]}px;
  padding: 0;
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.lg}px;
  color: ${({ theme }) => theme.colors.text};
`
