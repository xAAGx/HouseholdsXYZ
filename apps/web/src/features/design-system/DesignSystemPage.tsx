import { accentNames, type Accent } from '@households/theme'
import { useState, type ReactNode } from 'react'
import styled, { useTheme } from 'styled-components'

import { AppHeader } from '../../components/app/AppHeader'
import { Icon, type IconName } from '../../components/icons'
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  Chip,
  Combobox,
  Container,
  Eyebrow,
  FieldGroup,
  Grid,
  HeroTitle,
  Highlight,
  IconChip,
  Lede,
  Muted,
  NameTag,
  PageTitle,
  PasswordField,
  Pill,
  Playful,
  PointsBadge,
  Row,
  SectionTitle,
  Select,
  Stack,
  StatusDot,
  StatusText,
  Text,
  TextField,
} from '../../components/ui'

/**
 * Living style guide (development only, at /design). Renders every token and
 * component from the real code, so it can't drift from the implementation.
 * Update it whenever you add a component. The rules live in DESIGN.md.
 */
export function DesignSystemPage() {
  const theme = useTheme()
  const semantic = Object.entries(theme.colors).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  const icons: IconName[] = [
    'chores',
    'calendar',
    'lists',
    'money',
    'vault',
    'memories',
    'chat',
    'home',
    'check',
  ]

  return (
    <>
      <AppHeader actions={<Muted as="span">Design system · dev only</Muted>} />
      <Container>
        <Body $gap={8}>
          <Stack $gap={3}>
            <Eyebrow>Households.xyz</Eyebrow>
            <PageTitle>Playhouse · Balanced</PageTitle>
            <Lede>
              Friendly, grown-up. Fun lives in the accents; structure stays calm. Rules and
              reasoning are in DESIGN.md at the repo root.
            </Lede>
          </Stack>

          <Block title="Semantic colors" note="Pick by role, never by hue.">
            <Grid $columns={4} $gap={3}>
              {semantic.map(([name, value]) => (
                <Swatch key={name} $color={value}>
                  <i />
                  <b>{name}</b>
                  <code>{value}</code>
                </Swatch>
              ))}
            </Grid>
          </Block>

          <Block
            title="Accents"
            note="tint = areas · deep = icons/text on tint · base = small details"
          >
            <Grid $columns={4} $gap={3}>
              {accentNames.map((name) => (
                <Card key={name} $variant="plain" $padding="sm">
                  <Stack $gap={2}>
                    <b>{name}</b>
                    <Row $gap={2}>
                      {(['base', 'tint', 'deep'] as const).map((k) => (
                        <Swatch key={k} $color={theme.colors.accents[name][k]} $small>
                          <i />
                          <code>{k}</code>
                        </Swatch>
                      ))}
                    </Row>
                  </Stack>
                </Card>
              ))}
            </Grid>
          </Block>

          <Block title="Typography" note="Bricolage Grotesque · Figtree · Fredoka (accents only)">
            <Stack $gap={4}>
              <HeroTitle>
                Hero title with a <Highlight>highlight</Highlight>
              </HeroTitle>
              <PageTitle>Page title</PageTitle>
              <SectionTitle>Section title</SectionTitle>
              <CardTitle>Card title</CardTitle>
              <Eyebrow>Eyebrow label</Eyebrow>
              <Lede>Lede: the intro paragraph under a title, at most two or three lines.</Lede>
              <Text>Text: body copy for descriptions and explanations.</Text>
              <Muted>Muted: timestamps, counts and helper lines.</Muted>
              <p>
                <Playful>Playful</Playful> is for short labels only: “Today”, “+5”, the logo.
              </p>
            </Stack>
          </Block>

          <Block title="Buttons" note="One primary per section. Danger always asks to confirm.">
            <Stack $gap={4}>
              {(['lg', 'md', 'sm'] as const).map((size) => (
                <Row key={size} $gap={3}>
                  <Button $size={size}>Primary</Button>
                  <Button $size={size} $variant="secondary">
                    Secondary
                  </Button>
                  <Button $size={size} $variant="ghost">
                    Ghost
                  </Button>
                  <Button $size={size} $variant="danger">
                    Delete
                  </Button>
                  <Button $size={size} disabled>
                    Disabled
                  </Button>
                </Row>
              ))}
              <InverseBox>
                <Button $variant="inverse">Inverse (on dark bands)</Button>
              </InverseBox>
            </Stack>
          </Block>

          <Block
            title="Cards"
            note="outlined = primary objects · soft = groupings · plain = dense app lists"
          >
            <Grid $columns={4} $gap={5}>
              <Card>
                <CardTitle>Outlined</CardTitle>
                <Text>Default. Things you act on.</Text>
              </Card>
              <Card $variant="soft" $tone="sky">
                <CardTitle>Soft · sky</CardTitle>
                <Text>Secondary grouping.</Text>
              </Card>
              <Card $variant="plain">
                <CardTitle>Plain</CardTitle>
                <Text>Lists and settings.</Text>
              </Card>
              <Card $variant="inverse">
                <CardTitle $onInverse>Inverse</CardTitle>
                <Text $onInverse>The one featured item.</Text>
              </Card>
            </Grid>
          </Block>

          <Block title="Chips, badges & status">
            <Row $gap={3}>
              <Pill>
                <StatusDot $tone="grass" /> Private by default
              </Pill>
              <Chip>Household</Chip>
              <Chip $selected>Selected</Chip>
              <NameTag>Teens</NameTag>
              <PointsBadge>+5</PointsBadge>
              <StatusText $status="success">Paid by Sam</StatusText>
              <StatusText $status="warning">Due soon</StatusText>
              <StatusText $status="danger">Overdue</StatusText>
            </Row>
          </Block>

          <Block
            title="Icons & icon chips"
            note="24px line icons, 2px stroke, on a tint with the deep tone."
          >
            <Row $gap={3}>
              {icons.map((name, i) => (
                <IconChip key={name} $tone={accentNames[i % accentNames.length] as Accent}>
                  <Icon name={name} size={22} label={name} />
                </IconChip>
              ))}
            </Row>
          </Block>

          <Block title="Form fields">
            <Grid $columns={3} $gap={5}>
              <TextField label="Household name" placeholder="The Smiths" />
              <TextField
                label="Web address"
                defaultValue="TheSmithsHouse"
                hint="Private until you publish it."
              />
              <TextField
                label="Email"
                defaultValue="not-an-email"
                error="Enter a valid email address."
              />
              <PasswordDemo />
            </Grid>
            <FieldGroup legend="Where you live">
              <Grid $columns={3} $gap={5}>
                <Select label="Country" placeholder="Choose a country" defaultValue="">
                  <option value="EG">Egypt</option>
                  <option value="US">United States</option>
                </Select>
                <Select label="State or region" placeholder="Choose a country first" disabled />
                <CityComboboxDemo />
              </Grid>
            </FieldGroup>
            <Checkbox defaultChecked>
              I agree to the <a href="#terms">Terms of Service</a>.
            </Checkbox>
          </Block>
        </Body>
      </Container>
    </>
  )
}

const DEMO_CITIES = [
  { id: 1, name: 'Springfield', district: 'Sangamon County' },
  { id: 2, name: 'Springfield', district: 'Hampden County' },
  { id: 3, name: 'Spring Valley', district: null },
  { id: 4, name: 'Salem', district: null },
]

function PasswordDemo() {
  const [password, setPassword] = useState('Correct-horse')
  return (
    <PasswordField
      label="Password"
      showRequirements
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />
  )
}

function CityComboboxDemo() {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState(false)
  const matches = DEMO_CITIES.filter((c) => c.name.toLowerCase().startsWith(text.toLowerCase()))
  return (
    <Combobox
      label="City or town"
      placeholder="Try “spr”"
      inputValue={text}
      onInputChange={(value) => {
        setText(value)
        setPicked(false)
      }}
      options={matches}
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getDescription={(c) => c.district}
      onSelect={(c) => {
        setText(c.name)
        setPicked(true)
      }}
      selected={picked}
      emptyText="No city found."
    />
  )
}

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Stack $gap={4}>
      <div>
        <SectionTitle as="h2">{title}</SectionTitle>
        {note && <Muted>{note}</Muted>}
      </div>
      {children}
    </Stack>
  )
}

const Body = styled(Stack)`
  padding: ${({ theme }) => theme.space[7]}px 0 ${({ theme }) => theme.space[9]}px;
`

const Swatch = styled.div<{ $color: string; $small?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs}px;

  i {
    display: block;
    height: ${({ $small }) => ($small ? 32 : 48)}px;
    width: ${({ $small }) => ($small ? '48px' : 'auto')};
    border-radius: ${({ theme }) => theme.radii.sm}px;
    border: 1px solid ${({ theme }) => theme.colors.hairline};
    background: ${({ $color }) => $color};
  }

  b {
    font-size: ${({ theme }) => theme.fontSizes.sm}px;
    overflow-wrap: anywhere;
  }

  code {
    color: ${({ theme }) => theme.colors.textMuted};
    overflow-wrap: anywhere;
  }
`

const InverseBox = styled.div`
  padding: ${({ theme }) => theme.space[5]}px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.inverse};
`
