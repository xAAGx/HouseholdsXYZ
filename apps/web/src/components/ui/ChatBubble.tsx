import type { ReactNode } from 'react'
import styled from 'styled-components'

/**
 * One chat message. Yours sit on the right on the sky tint; everyone else's
 * on the left, on the surface with a hairline. Text keeps its line breaks and
 * long words wrap. Put the time, "edited" and any actions in `footer`.
 */
export function ChatBubble({
  mine,
  author,
  quote,
  footer,
  children,
}: {
  mine: boolean
  /** Who wrote it, above the bubble (leave out for your own and for direct chats). */
  author?: ReactNode
  /** The message it replies to, shortened. */
  quote?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Wrap $mine={mine}>
      {author && <Author>{author}</Author>}
      <Bubble $mine={mine}>
        {quote && <Quote>{quote}</Quote>}
        {children}
      </Bubble>
      {footer && <Footer $mine={mine}>{footer}</Footer>}
    </Wrap>
  )
}

const Wrap = styled.div<{ $mine: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${({ $mine }) => ($mine ? 'flex-end' : 'flex-start')};
  gap: ${({ theme }) => theme.space[1]}px;
  max-width: min(560px, 85%);
  margin-left: ${({ $mine }) => ($mine ? 'auto' : '0')};
`

const Author = styled.span`
  padding: 0 ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme }) => theme.fontSizes.xs}px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textMuted};
`

const Bubble = styled.div<{ $mine: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  min-width: 0;
  max-width: 100%;
  padding: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  border: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme, $mine }) => ($mine ? 'transparent' : theme.colors.hairline)};
  background: ${({ theme, $mine }) =>
    $mine ? theme.colors.accents.sky.tint : theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  img {
    display: block;
    max-width: 100%;
    max-height: 360px;
    border-radius: ${({ theme }) => theme.radii.md}px;
  }
`

const Quote = styled.span`
  display: block;
  max-width: 100%;
  padding-left: ${({ theme }) => theme.space[3]}px;
  border-left: 3px solid ${({ theme }) => theme.colors.outline};
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Footer = styled.div<{ $mine: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: ${({ $mine }) => ($mine ? 'flex-end' : 'flex-start')};
  gap: ${({ theme }) => theme.space[1]}px ${({ theme }) => theme.space[2]}px;
  padding: 0 ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.fontSizes.xs}px;
  color: ${({ theme }) => theme.colors.textMuted};
`
