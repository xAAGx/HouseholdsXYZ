import type { Accent } from '@households/theme'
import styled from 'styled-components'

import { Icon } from '../../../components/icons'
import {
  Card,
  CardTitle,
  Container,
  Eyebrow,
  Grid,
  IconChip,
  Section,
  SectionHeader,
  SectionTitle,
  Text,
} from '../../../components/ui'
import { togetherPoints } from '../content'

const houseTones: Accent[] = ['coral', 'yellow', 'grass', 'sky']

export function TogetherSection() {
  return (
    <Section id="together">
      <Container>
        <SectionHeader>
          <Eyebrow>Family & neighbors</Eyebrow>
          <SectionTitle>Your whole circle, on your terms.</SectionTitle>
        </SectionHeader>
        <Grid $columns={3} $gap={5}>
          {togetherPoints.map((p, i) => (
            <Card key={p.title}>
              <Houses aria-hidden="true">
                {houseTones.slice(0, i + 2).map((tone) => (
                  <IconChip key={tone} $tone={tone} $size={36}>
                    <Icon name="home" size={16} strokeWidth={2.25} />
                  </IconChip>
                ))}
              </Houses>
              <CardTitle>{p.title}</CardTitle>
              <Text>{p.body}</Text>
            </Card>
          ))}
        </Grid>
      </Container>
    </Section>
  )
}

const Houses = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
`
