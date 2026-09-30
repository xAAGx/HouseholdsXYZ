import type { ReactNode, TextareaHTMLAttributes } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { FieldHint, FieldLabel, FieldWrapper, inputStyles, useFieldIds } from './field'

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string | undefined
}

/** Multi-line text, styled and wired like TextField. */
export function TextArea({ label, hint, error, rows = 4, ...textareaProps }: TextAreaProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error)

  return (
    <FieldWrapper>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Control
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        $invalid={Boolean(error)}
        {...textareaProps}
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

const Control = styled.textarea<{ $invalid: boolean }>`
  ${inputStyles};
  padding-top: 12px;
  padding-bottom: 12px;
  line-height: ${({ theme }) => theme.lineHeights.normal};
  resize: vertical;
`
