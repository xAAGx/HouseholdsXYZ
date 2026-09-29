import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { focusRing } from './mixins'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string | undefined
}

/** Labelled text input with hint and error wired up for screen readers. */
export function TextField({ label, hint, error, ...inputProps }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        $invalid={Boolean(error)}
        {...inputProps}
      />
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </Field>
  )
}

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input<{ $invalid: boolean }>`
  min-height: ${({ theme }) => theme.layout.hitTarget + 4}px;
  padding: 0 14px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme, $invalid }) => ($invalid ? theme.colors.danger : theme.colors.outline)};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.md}px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSubtle};
  }

  &:focus-visible {
    ${focusRing};
    outline-color: ${({ theme, $invalid }) => ($invalid ? theme.colors.danger : theme.colors.focusRing)};
  }
`

const Hint = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`
