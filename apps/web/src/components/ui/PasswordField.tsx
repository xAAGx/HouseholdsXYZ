import { PASSWORD_REQUIREMENTS } from '@households/shared'
import { useState, type InputHTMLAttributes } from 'react'
import styled from 'styled-components'

import { Icon } from '../icons'
import { ErrorText } from './ErrorText'
import { FieldLabel, FieldWrapper, inputStyles, useFieldIds } from './field'
import { visuallyHidden } from './mixins'

interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type' | 'value'
> {
  label: string
  value: string
  error?: string | undefined
  /** For new passwords: shows the live requirements checklist. */
  showRequirements?: boolean
}

/**
 * Password input with a show/hide toggle. With `showRequirements`, a live
 * checklist tells people what's still missing (marked with text and an icon,
 * not only color).
 */
export function PasswordField({
  label,
  value,
  error,
  showRequirements = false,
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const hint = showRequirements ? 'requirements' : null
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error)

  return (
    <FieldWrapper>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Wrap>
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          $invalid={Boolean(error)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          {...inputProps}
        />
        <Toggle
          type="button"
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Hide' : 'Show'}
          <Hidden> password</Hidden>
        </Toggle>
      </Wrap>
      {showRequirements && (
        <Requirements id={hintId} aria-label="Password requirements">
          {PASSWORD_REQUIREMENTS.map((r) => {
            const met = r.test(value)
            return (
              <Requirement key={r.id} $met={met}>
                <Mark $met={met} aria-hidden="true">
                  {met && <Icon name="check" size={12} strokeWidth={3} />}
                </Mark>
                {r.label}
                <Hidden>{met ? ' (done)' : ' (missing)'}</Hidden>
              </Requirement>
            )
          })}
        </Requirements>
      )}
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
`

const Input = styled.input<{ $invalid: boolean }>`
  ${inputStyles};
  padding-right: 76px;
`

const Toggle = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceMuted};
  }
`

const Hidden = styled.span`
  ${visuallyHidden};
`

const Requirements = styled.ul`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 16px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const Requirement = styled.li<{ $met: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme, $met }) => ($met ? theme.colors.success : theme.colors.textMuted)};
`

const Mark = styled.span<{ $met: boolean }>`
  flex: none;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid
    ${({ theme, $met }) => ($met ? theme.colors.success : theme.colors.textSubtle)};
  background: ${({ theme, $met }) => ($met ? theme.colors.successSurface : 'transparent')};
`
