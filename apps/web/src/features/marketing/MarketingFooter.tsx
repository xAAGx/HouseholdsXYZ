import styled from 'styled-components'

import { Logo } from '../../components/ui'
import { container } from '../../components/ui/mixins'

export function MarketingFooter() {
  return (
    <Footer>
      <Inner>
        <Logo onInverse />
        <nav aria-label="Footer">
          <a href="#privacy">Privacy</a>
          <a href="#privacy">Safety</a>
          <a href="#pricing">Pricing</a>
          <a href="#top">Terms</a>
        </nav>
      </Inner>
    </Footer>
  )
}

const Footer = styled.footer`
  background: ${({ theme }) => theme.colors.inverse};
  color: ${({ theme }) => theme.colors.onInverse};
`

const Inner = styled.div`
  ${container};
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding-top: 40px;
  padding-bottom: 48px;

  nav {
    display: flex;
    gap: 24px;
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }

  a {
    color: inherit;
    text-decoration: none;
  }
`
