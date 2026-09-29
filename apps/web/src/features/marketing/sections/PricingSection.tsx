import styled from 'styled-components'

import {
  Card,
  Container,
  Eyebrow,
  Playful,
  Section,
  SectionHeader,
  SectionTitle,
} from '../../../components/ui'
import { plans } from '../content'

export function PricingSection() {
  return (
    <Section id="pricing">
      <Container>
        <SectionHeader>
          <Eyebrow>Pricing</Eyebrow>
          <SectionTitle>Free for every household.</SectionTitle>
        </SectionHeader>
        <Plans>
          {plans.map((plan) => (
            <Card key={plan.name} $variant={plan.featured ? 'inverse' : 'outlined'} $padding="lg">
              {plan.featured && (
                <Sticker>
                  <Playful>More room, more help</Playful>
                </Sticker>
              )}
              <PlanName>{plan.name}</PlanName>
              <Summary>{plan.summary}</Summary>
              <Items $featured={plan.featured}>
                {plan.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </Items>
            </Card>
          ))}
        </Plans>
      </Container>
    </Section>
  )
}

const Plans = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
  max-width: 920px;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const Sticker = styled.span`
  position: absolute;
  top: -16px;
  right: 24px;
  padding: 4px 12px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: 14px;
  transform: rotate(3deg);
`

const PlanName = styled.h3`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 34px;
  letter-spacing: ${({ theme }) => theme.letterSpacings.heading};
`

const Summary = styled.p`
  margin-top: 4px;
  font-size: ${({ theme }) => theme.fontSizes.lg}px;
  opacity: 0.85;
`

const Items = styled.ul<{ $featured: boolean }>`
  margin: 20px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 9px 0;
    border-top: 1px solid
      ${({ theme, $featured }) => ($featured ? theme.colors.onInverseMuted : theme.colors.hairline)};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};

    &::before {
      content: '✓';
      margin-right: 10px;
      font-weight: ${({ theme }) => theme.fontWeights.extrabold};
      color: ${({ theme, $featured }) => ($featured ? theme.colors.primary : theme.colors.success)};
    }
  }
`
