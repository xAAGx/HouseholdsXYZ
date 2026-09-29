import {
  Card,
  Container,
  Eyebrow,
  Grid,
  NameTag,
  Section,
  SectionHeader,
  SectionTitle,
  Stack,
  Text,
} from '../../../components/ui'
import { generations } from '../content'

export function GenerationsSection() {
  return (
    <Section>
      <Container>
        <SectionHeader>
          <Eyebrow>For every generation</Eyebrow>
          <SectionTitle>Made for everyone under your roof.</SectionTitle>
        </SectionHeader>
        <Grid $columns={4} $gap={5}>
          {generations.map((g) => (
            <Card key={g.who} $variant="soft" $tone={g.tone}>
              <Stack $gap={3} $align="start">
                <NameTag>{g.who}</NameTag>
                <Text>{g.body}</Text>
              </Stack>
            </Card>
          ))}
        </Grid>
      </Container>
    </Section>
  )
}
