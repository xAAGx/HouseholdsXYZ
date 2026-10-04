import { Link } from 'react-router'
import styled from 'styled-components'

import { ButtonLink, Logo } from '../../components/ui'
import { container } from '../../components/ui/mixins'
import { useLooksSignedIn } from '../../lib/session-hint'
import { navLinks } from './content'

export function MarketingNav() {
  const signedIn = useLooksSignedIn()
  return (
    <Bar>
      <Logo />
      <Links aria-label="Homepage sections">
        {navLinks.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </Links>
      <Actions>
        {signedIn ? (
          <ButtonLink to="/app">Your households</ButtonLink>
        ) : (
          <>
            <SignIn to="/sign-in">Sign in</SignIn>
            <ButtonLink to="/sign-up">Get started</ButtonLink>
          </>
        )}
      </Actions>
    </Bar>
  )
}

const Bar = styled.header`
  ${container};
  display: flex;
  align-items: center;
  gap: 36px;
  padding-top: 20px;
  padding-bottom: 20px;
`

const Links = styled.nav`
  display: flex;
  gap: 26px;

  a {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    text-decoration: none;
    color: ${({ theme }) => theme.colors.textMuted};

    &:hover {
      color: ${({ theme }) => theme.colors.text};
    }
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    display: none;
  }
`

const Actions = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 18px;
`

const SignIn = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    display: none;
  }
`
