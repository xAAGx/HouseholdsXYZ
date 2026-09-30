import type { InputHTMLAttributes, ReactNode } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { FieldHint, FieldLabel, FieldWrapper, inputStyles, useFieldIds } from './field'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string | undefined
}

/** Labelled text input with hint and error wired up for screen readers. */
export function TextField({ label, hint, error, ...inputProps }: TextFieldProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error)

  return (
    <FieldWrapper>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        $invalid={Boolean(error)}
        {...inputProps}
      />
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </FieldWrapper>
  )
}

const Input = styled.input<{ $invalid: boolean }>`
  ${inputStyles};
`
