import type { InputHTMLAttributes, ReactNode } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { useFieldIds } from './field'
import { focusRing } from './mixins'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  /** The label. May contain links (e.g. to the Terms). */
  children: ReactNode
  error?: string | undefined
  /** Body-size text, for checklists (list items, chores). */
  large?: boolean
}

/** A checkbox with its label to the right. The whole label is clickable. */
export function Checkbox({ children, error, large = false, ...inputProps }: CheckboxProps) {
  const { id, errorId, describedBy } = useFieldIds(null, error)

  return (
    <div>
      <Row htmlFor={id} $large={large}>
        <Box
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          $invalid={Boolean(error)}
          {...inputProps}
        />
        <span>{children}</span>
      </Row>
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </div>
  )
}

const Row = styled.label<{ $large: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme, $large }) => ($large ? theme.fontSizes.md : theme.fontSizes.sm)}px;
  line-height: ${({ theme }) => theme.lineHeights.snug};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`

const Box = styled.input<{ $invalid: boolean }>`
  flex: none;
  width: 22px;
  height: 22px;
  margin: 0;
  accent-color: ${({ theme }) => theme.colors.text};
  outline: ${({ theme, $invalid }) => ($invalid ? `2px solid ${theme.colors.danger}` : 'none')};
  outline-offset: 2px;
  cursor: pointer;

  &:focus-visible {
    ${focusRing};
  }
`
