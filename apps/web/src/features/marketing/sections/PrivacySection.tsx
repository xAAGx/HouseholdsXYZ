import styled from 'styled-components'

import { Icon } from '../../../components/icons'
import {
  CardTitle,
  Chip,
  Container,
  Eyebrow,
  Lede,
  Playful,
  Section,
  SectionTitle,
  Stack,
  Text,
} from '../../../components/ui'
import { audiences, privacyPoints } from '../content'

export function PrivacySection() {
  return (
    <Section id="privacy" $tone="inverse">
      <Layout>
        <Stack $gap={4}>
          <Eyebrow $onInverse>Privacy</Eyebrow>
          <SectionTitle $onInverse>Safe for kids. Serious about privacy.</SectionTitle>
          <Lede $onInverse>
            Your household is private from the first tap. You decide who sees each post, photo and
            plan, and children’s accounts stay in parents’ hands.
          </Lede>
          <Chooser aria-hidden="true">
            <Playful as="p">Who can see this?</Playful>
            <Chips>
              {audiences.map((a) => (
                <Chip key={a.id} $selected={a.isDefault}>
                  {a.label}
                </Chip>
              ))}
            </Chips>
          </Chooser>
        </Stack>

        <Points>
          {privacyPoints.map((p) => (
            <li key={p.title}>
              <CheckMark>
                <Icon name="check" size={14} strokeWidth={3} />
              </CheckMark>
              <div>
                <CardTitle $onInverse>{p.title}</CardTitle>
                <Text $onInverse>{p.body}</Text>
              </div>
            </li>
          ))}
        </Points>
      </Layout>
    </Section>
  )
}

const Layout = styled(Container)`
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 64px;
  align-items: center;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 40px;
  }
`

const Chooser = styled.div`
  margin-top: ${({ theme }) => theme.space[3]}px;
  padding: 20px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.onInverse};
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) =>
    `${theme.shadowOffsets.md}px ${theme.shadowOffsets.md}px 0 ${theme.colors.primary}`};
  color: ${({ theme }) => theme.colors.text};

  > p {
    margin-bottom: 12px;
    font-size: 18px;
  }
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const Points = styled.ul`
  display: grid;
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
`

const CheckMark = styled.span`
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-top: 1px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onPrimary};
`
