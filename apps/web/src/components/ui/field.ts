import { useId } from 'react'
import styled, { css } from 'styled-components'

import { focusRing } from './mixins'

/**
 * Building blocks shared by every form control (TextField, Select,
 * PasswordField, Combobox), so they all look and behave the same.
 */

/** The look of a text-like control: 2px outline, 48px tall, focus ring. */
export const inputStyles = css<{ $invalid?: boolean }>`
  width: 100%;
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
    outline-color: ${({ theme, $invalid }) =>
      $invalid ? theme.colors.danger : theme.colors.focusRing};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surfaceMuted};
    color: ${({ theme }) => theme.colors.textMuted};
    cursor: not-allowed;
    opacity: 1; /* browsers fade disabled selects; keep every control the same */
  }
`

export const FieldWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`

export const FieldLabel = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

export const FieldHint = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`

/** Ids that wire a control to its hint and error for screen readers. */
export function useFieldIds(hint: unknown, error: unknown) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return { id, hintId, errorId, describedBy: describedBy || undefined }
}
