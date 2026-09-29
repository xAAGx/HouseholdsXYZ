import { Link } from 'react-router'
import styled from 'styled-components'

import { Icon } from '../icons'

/**
 * The Households.xyz logo: yellow house badge (tilted -4°) + "households" in
 * the playful face. Always links home. Don't recolor, restyle or re-tilt it.
 */
export function Logo({ onInverse = false }: { onInverse?: boolean }) {
  return (
    <Wordmark to="/" $onInverse={onInverse} aria-label="Households.xyz home">
      <Badge aria-hidden="true">
        <Icon name="home" size={18} strokeWidth={2.5} />
      </Badge>
      households
    </Wordmark>
  )
}

const Wordmark = styled(Link)<{ $onInverse: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: ${({ theme }) => theme.fonts.playful};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 24px;
  line-height: 1;
  text-decoration: none;
  color: ${({ theme, $onInverse }) => ($onInverse ? theme.colors.onInverse : theme.colors.text)};
`

const Badge = styled.span`
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onPrimary};
  transform: rotate(-4deg);
`
