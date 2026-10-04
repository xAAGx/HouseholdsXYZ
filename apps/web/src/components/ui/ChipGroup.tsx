import type { ReactNode } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { FieldHint, useFieldIds } from './field'

/**
 * A labelled set of ChipButtons inside a form ("On these days"). Labelled
 * like TextField, with an optional hint and error; a real fieldset + legend,
 * so screen readers announce the label with each chip.
 */
export function ChipGroup({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | undefined
  /** The ChipButtons. */
  children: ReactNode
}) {
  const { hintId, errorId, describedBy } = useFieldIds(hint, error)

  return (
    <Fieldset aria-describedby={describedBy}>
      <Legend>{label}</Legend>
      <Chips>{children}</Chips>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </Fieldset>
  )
}

const Fieldset = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
`

const Legend = styled.legend`
  float: left; /* lets the fieldset's flex gap apply to the legend too */
  width: 100%;
  padding: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]}px;
`
