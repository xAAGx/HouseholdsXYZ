import styled from 'styled-components'

/** Inline error message. Says what went wrong and how to fix it. */
export const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.danger};
`
