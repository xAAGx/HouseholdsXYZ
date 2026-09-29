import type { Accent } from '@households/theme'
import styled from 'styled-components'

import {
  CardTitle,
  Container,
  Eyebrow,
  Section,
  SectionHeader,
  SectionTitle,
  Text,
} from '../../../components/ui'
import { steps } from '../content'

const stepTones: Accent[] = ['yellow', 'sky', 'grass']

export function StepsSection() {
  return (
    <Section>
      <Container>
        <SectionHeader>
          <Eyebrow>Getting started</Eyebrow>
          <SectionTitle>Set up in three steps.</SectionTitle>
        </SectionHeader>
        <List>
          {steps.map((s, i) => (
            <li key={s.title}>
              <StepNumber $tone={stepTones[i] ?? 'yellow'}>{i + 1}</StepNumber>
              <div>
                <CardTitle>{s.title}</CardTitle>
                <Text>{s.body}</Text>
              </div>
            </li>
          ))}
        </List>
      </Container>
    </Section>
  )
}

const List = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 32px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

/** The first step gets the primary fill; later steps use soft tints. */
const StepNumber = styled.span<{ $tone: Accent }>`
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: 50%;
  background: ${({ theme, $tone }) =>
    $tone === 'yellow' ? theme.colors.primary : theme.colors.accents[$tone].tint};
  font-family: ${({ theme }) => theme.fonts.playful};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 24px;
`
