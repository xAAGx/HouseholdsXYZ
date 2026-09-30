import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import styled from 'styled-components'

import { ErrorText } from './ErrorText'
import { FieldHint, FieldLabel, FieldWrapper, inputStyles, useFieldIds } from './field'
import { offsetShadow, visuallyHidden } from './mixins'

interface ComboboxProps<T> {
  label: string
  hint?: ReactNode
  error?: string | undefined
  /** What's typed in the box. */
  inputValue: string
  onInputChange: (value: string) => void
  /** Results for the current input (the parent does the searching). */
  options: readonly T[]
  getKey: (option: T) => string | number
  getLabel: (option: T) => string
  /** Secondary line, e.g. the district that tells same-named towns apart. */
  getDescription?: (option: T) => string | null | undefined
  onSelect: (option: T) => void
  loading?: boolean
  /** Shown when the search has no results. */
  emptyText?: string
  placeholder?: string
  disabled?: boolean
  /** True while the input shows a chosen option; the list stays closed until typing. */
  selected?: boolean
}

/**
 * Searchable single-select (ARIA combobox with a listbox popup). Use it for
 * long lists people type into, like cities. Arrow keys move, Enter picks,
 * Escape closes; the result count is announced to screen readers.
 */
export function Combobox<T>({
  label,
  hint,
  error,
  inputValue,
  onInputChange,
  options,
  getKey,
  getLabel,
  getDescription,
  onSelect,
  loading = false,
  emptyText = 'No matches.',
  placeholder,
  disabled = false,
  selected = false,
}: ComboboxProps<T>) {
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const showList = open && !selected && inputValue.trim().length > 0 && !disabled

  const pick = (option: T) => {
    onSelect(option)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && showList && options[active]) {
      event.preventDefault()
      pick(options[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const status = loading
    ? 'Searching…'
    : options.length === 0
      ? emptyText
      : `${options.length} result${options.length === 1 ? '' : 's'}`

  return (
    <FieldWrapper>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Wrap>
        <Input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={inputValue}
          $invalid={Boolean(error)}
          onChange={(e) => {
            onInputChange(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showList && (
          <List id={listId} role="listbox" aria-label={label}>
            {options.length === 0 ? (
              <Empty role="presentation">{loading ? 'Searching…' : emptyText}</Empty>
            ) : (
              options.map((option, i) => {
                const description = getDescription?.(option)
                return (
                  <Option
                    key={getKey(option)}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    $active={i === active}
                    // mousedown, not click: runs before the input's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(option)
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span>{getLabel(option)}</span>
                    {description && <small>{description}</small>}
                  </Option>
                )
              })
            )}
          </List>
        )}
      </Wrap>
      <Status aria-live="polite">{showList ? status : ''}</Status>
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
`

const Input = styled.input<{ $invalid: boolean }>`
  ${inputStyles};
`

const List = styled.ul`
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 280px;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => offsetShadow(theme, 'md')};
`

const Option = styled.li<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  background: ${({ theme, $active }) => ($active ? theme.colors.surfaceMuted : 'transparent')};
  cursor: pointer;

  span {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }

  small {
    font-size: ${({ theme }) => theme.fontSizes.sm}px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`

const Empty = styled.li`
  padding: 8px 10px;
  color: ${({ theme }) => theme.colors.textMuted};
`

const Status = styled.span`
  ${visuallyHidden};
`
