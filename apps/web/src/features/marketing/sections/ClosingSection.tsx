import styled from 'styled-components'

import { ButtonLink, Container, Lede, Section, SectionTitle, Stack } from '../../../components/ui'

export function ClosingSection() {
  return (
    <Section $tone="tint">
      <Container>
        <Centered $gap={5} $align="center">
          <SectionTitle>Home runs better together.</SectionTitle>
          <Lede>
            Set up your household in a few minutes. It stays private until you decide otherwise.
          </Lede>
          <ButtonLink to="/sign-in" $size="lg">
            Start your household
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
