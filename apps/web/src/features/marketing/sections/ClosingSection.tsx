import styled from 'styled-components'

import { ButtonLink, Container, Lede, Section, SectionTitle, Stack } from '../../../components/ui'
import { useLooksSignedIn } from '../../../lib/session-hint'

export function ClosingSection() {
  const signedIn = useLooksSignedIn()
  return (
    <Section $tone="tint">
      <Container>
        <Centered $gap={5} $align="center">
          <SectionTitle>Home runs better together.</SectionTitle>
          <Lede>
            Set up your household in a few minutes. It stays private until you decide otherwise.
          </Lede>
          <ButtonLink to={signedIn ? '/app' : '/sign-up'} $size="lg">
            {signedIn ? 'Open your households' : 'Start your household'}
          </ButtonLink>
        </Centered>
      </Container>
    </Section>
  )
}

const Centered = styled(Stack)`
  text-align: center;

  h2 {
    max-width: none;
  }
`
