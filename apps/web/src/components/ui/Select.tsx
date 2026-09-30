import type { ReactNode, SelectHTMLAttributes } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { FieldHint, FieldLabel, FieldWrapper, inputStyles, useFieldIds } from './field'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string | undefined
  /** Shown as the first, empty option ("Choose a country"). */
  placeholder?: string
  /** The options. Empty while they load or before an earlier choice is made. */
  children?: ReactNode
}

/**
 * A native select, styled like TextField. Native keeps it accessible and
 * gives phones their own picker. For long lists people search, use Combobox.
 */
export function Select({ label, hint, error, placeholder, children, ...selectProps }: SelectProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error)

  return (
    <FieldWrapper>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Wrap>
        <Control
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          $invalid={Boolean(error)}
          {...selectProps}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {children}
        </Control>
      </Wrap>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </FieldWrapper>
  )
}

const Wrap = styled.div`
  position: relative;

  /* Chevron drawn with borders so it takes the theme's text color. */
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 16px;
    width: 8px;
    height: 8px;
    border-right: 2px solid ${({ theme }) => theme.colors.text};
    border-bottom: 2px solid ${({ theme }) => theme.colors.text};
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }

  &:has(select:disabled)::after {
    border-color: ${({ theme }) => theme.colors.textMuted};
  }
`

const Control = styled.select<{ $invalid: boolean }>`
  ${inputStyles};
  appearance: none;
  padding-right: 40px;
  cursor: pointer;
`
