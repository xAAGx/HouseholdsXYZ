import styled from 'styled-components'

import {
  ButtonAnchor,
  ButtonLink,
  HeroTitle,
  Highlight,
  Lede,
  Pill,
  StatusDot,
} from '../../../components/ui'
import { container } from '../../../components/ui/mixins'
import { HeroBoard } from '../HeroBoard'

export function HeroSection() {
  return (
    <Hero id="top">
      <Copy>
        <Pill>
          <StatusDot $tone="grass" /> Private by default
        </Pill>
        <HeroTitle>
          Everyone <Highlight>in the loop</Highlight>. Nothing leaves the house.
        </HeroTitle>
        <Lede>
          Chores, calendars, money, documents and memories for the whole household, from the kids’
          points to the insurance papers. Private by default, shared on your terms.
        </Lede>
        <Actions>
          <ButtonLink to="/sign-up" $size="lg">
            Start your household
          </ButtonLink>
          <ButtonAnchor href="#features" $size="lg" $variant="secondary">
            See how it works
          </ButtonAnchor>
        </Actions>
        <Assurances>
          <li>Free to start</li>
          <li>Parent-managed kid accounts</li>
          <li>Export anytime</li>
        </Assurances>
      </Copy>
      <HeroBoard />
    </Hero>
  )
}

const Hero = styled.section`
  ${container};
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 56px;
  align-items: center;
  padding-top: 44px;
  padding-bottom: 72px;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
    padding-top: 20px;
  }
`

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
`

const Assurances = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 15px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};

  li::before {
    content: '✓';
    margin-right: 6px;
    font-weight: ${({ theme }) => theme.fontWeights.extrabold};
    color: ${({ theme }) => theme.colors.success};
  }
`
