import styled from 'styled-components'

import { visuallyHidden } from './mixins'

/**
 * A one-time code to read out or type on another device, such as a child's
 * sign-in code. Large, spaced Figtree (codes are read and typed, so they use
 * the body face). Screen readers hear it one character at a time.
 */
export function CodeDisplay({ code }: { code: string }) {
  const spelled = [...code.replace(/-/g, '')].join(' ')
  return (
    <Box>
      <Code aria-hidden="true">{code}</Code>
      <Spoken>{spelled}</Spoken>
    </Box>
  )
}

const Box = styled.div`
  padding: ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[4]}px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.surface};
  text-align: center;
`

const Code = styled.span`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes['4xl']}px;
  font-weight: ${({ theme }) => theme.fontWeights.extrabold};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  line-height: ${({ theme }) => theme.lineHeights.tight};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  user-select: all;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    font-size: ${({ theme }) => theme.fontSizes['2xl']}px;
  }
`

const Spoken = styled.span`
  ${visuallyHidden};
`
