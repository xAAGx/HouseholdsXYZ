import { useState, type ReactNode } from 'react'
import styled from 'styled-components'

import { Button } from './Button'
import { Row } from './layout'
import { Text } from './typography'

interface ConfirmButtonProps {
  /** The first button, e.g. "Remove". */
  children: ReactNode
  /** Says exactly what will happen and whether it can be undone. */
  message: ReactNode
  /** The danger button that does it, e.g. "Yes, remove Sam". */
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
}

/**
 * A destructive action that asks first (DESIGN.md: danger always confirms).
 * The first press only reveals the question; Cancel takes focus, so a second
 * accidental Enter does nothing harmful.
 */
export function ConfirmButton({
  children,
  message,
  confirmLabel,
  onConfirm,
  busy = false,
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <Button type="button" $variant="secondary" $size="sm" onClick={() => setAsking(true)}>
        {children}
      </Button>
    )
  }

  return (
    <Box role="group" aria-label={confirmLabel}>
      <Text>{message}</Text>
      <Row $gap={2}>
        <Button type="button" $variant="danger" $size="sm" disabled={busy} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
        <Button
          type="button"
          $variant="ghost"
          $size="sm"
          // Moving focus here keeps a stray keypress from confirming.
          autoFocus
          onClick={() => setAsking(false)}
        >
          Cancel
        </Button>
      </Row>
    </Box>
  )
}

const Box = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.dangerSurface};
`
