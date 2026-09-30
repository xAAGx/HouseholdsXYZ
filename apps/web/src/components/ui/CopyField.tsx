import { useRef, useState, type ReactNode } from 'react'
import styled from 'styled-components'

import { Button } from './Button'
import { FieldHint, FieldLabel, FieldWrapper, inputStyles, useFieldIds } from './field'
import { visuallyHidden } from './mixins'

interface CopyFieldProps {
  label: string
  value: string
  hint?: ReactNode
}

/**
 * A read-only value with a Copy button, such as an invite link to share. If
 * the clipboard isn't available, the text is selected so it can be copied by
 * hand, and the hint says so.
 */
export function CopyField({ label, value, hint }: CopyFieldProps) {
  const { id, hintId, describedBy } = useFieldIds(hint, undefined)
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('copied')
    } catch {
      input.current?.select()
      setStatus('failed')
    }
  }

  return (
    <FieldWrapper>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Row>
        <Input
          ref={input}
          id={id}
          readOnly
          value={value}
          aria-describedby={describedBy}
          onFocus={(e) => e.target.select()}
        />
        <Button type="button" $variant="secondary" onClick={() => void copy()}>
          {status === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </Row>
      {status === 'failed' ? (
        <FieldHint id={hintId}>
          Copying didn’t work here. The text is selected: copy it by hand.
        </FieldHint>
      ) : (
        hint && <FieldHint id={hintId}>{hint}</FieldHint>
      )}
      <Announce role="status">{status === 'copied' ? 'Copied.' : ''}</Announce>
    </FieldWrapper>
  )
}

const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]}px;
  align-items: stretch;

  > button {
    flex-shrink: 0;
  }
`

const Input = styled.input<{ $invalid?: boolean }>`
  ${inputStyles};
  flex: 1;
  min-width: 0;
  background: ${({ theme }) => theme.colors.surfaceMuted};
`

const Announce = styled.span`
  ${visuallyHidden};
`
