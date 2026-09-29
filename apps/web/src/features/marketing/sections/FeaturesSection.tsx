import styled from 'styled-components'

import { Icon } from '../../../components/icons'
import {
  Card,
  CardList,
  CardTitle,
  Container,
  Eyebrow,
  Grid,
  IconChip,
  Playful,
  Section,
  SectionHeader,
  SectionTitle,
  Text,
} from '../../../components/ui'
import { everydayFeatures, importantFeatures, type Feature } from '../content'

export function FeaturesSection() {
  return (
    <Section id="features">
      <Container>
        <SectionHeader>
          <Eyebrow>Features</Eyebrow>
          <SectionTitle>The everyday stuff and the important stuff.</SectionTitle>
        </SectionHeader>
        <Grid $columns={2} $gap={5}>
          <FeatureGroup title="Everyday" features={everydayFeatures} />
          <FeatureGroup title="Important" features={importantFeatures} />
        </Grid>
      </Container>
    </Section>
  )
}

function FeatureGroup({ title, features }: { title: string; features: readonly Feature[] }) {
  return (
    <Card $padding="lg">
      <GroupTitle>
        <Playful>{title}</Playful>
      </GroupTitle>
      <CardList>
        {features.map((f) => (
          <Item key={f.title}>
            <IconChip $tone={f.tone}>
              <Icon name={f.icon} size={22} />
            </IconChip>
            <div>
              <CardTitle>{f.title}</CardTitle>
              <Text>{f.body}</Text>
            </div>
          </Item>
        ))}
      </CardList>
    </Card>
  )
}

const GroupTitle = styled.h3`
  margin-bottom: ${({ theme }) => theme.space[2]}px;
  font-size: 22px;
`

const Item = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 16px;
`
