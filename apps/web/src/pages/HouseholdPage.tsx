import {
  HOUSEHOLD_VISIBILITY_LABELS,
  isMinorRole,
  type HouseholdDetail,
  type HouseholdMember,
  type HouseholdView,
  type MyMembership,
  type PublicHouseholdProfile,
} from '@households/shared'
import type { Accent } from '@households/theme'
import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import styled from 'styled-components'

import { AppHeader } from '../components/app/AppHeader'
import { Icon, type IconName } from '../components/icons'
import {
  ButtonLink,
  Card,
  CardTitle,
  Grid,
  IconChip,
  Muted,
  Page,
  PageTitle,
  Pill,
  Row,
  Stack,
  StatusDot,
  Text,
} from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { AddChildCard } from '../features/households/AddChildCard'
import { InviteCard } from '../features/households/InviteCard'
import { MembersCard } from '../features/households/MembersCard'
import { useHouseholdView, type AddressParams } from '../features/households/queries'
import { NotFoundPage } from './NotFoundPage'

/**
 * households.xyz/:country/:region/:city/:name. Members see their household;
 * everyone else sees a public profile if there is one, and otherwise the same
 * "not found" as for an address that doesn't exist.
 */
export function HouseholdPage() {
  const { status } = useAuth()
  const params = useParams()
  const address: AddressParams = {
    country: params.country ?? '',
    region: params.region ?? '',
    city: params.city ?? '',
    name: params.name ?? '',
  }
  const view = useHouseholdView(address, status === 'signed-in', status !== 'loading')

  if (status === 'loading' || view.isPending) {
    return (
      <Shell>
        <Muted>Loading…</Muted>
      </Shell>
    )
  }
  if (view.isError) return <NotFoundPage />

  return <HouseholdViewPage view={view.data} />
}

function HouseholdViewPage({ view }: { view: HouseholdView }) {
  switch (view.kind) {
    case 'moved':
      return <Navigate to={view.path} replace />
    case 'public':
      return <PublicHousehold household={view.household} />
    case 'member':
      return (
        <MemberHousehold
          household={view.household}
          me={{ role: view.myRole, permissions: view.permissions }}
          members={view.members}
        />
      )
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader
        actions={
          <ButtonLink to="/app" $variant="ghost" $size="sm">
            Your households
          </ButtonLink>
        }
      />
      <Page>{children}</Page>
    </>
  )
}

function placeLine(household: Pick<HouseholdDetail, 'place'>): string | null {
  return household.place ? `${household.place.cityName}, ${household.place.regionName}` : null
}

function MemberHousehold({
  household,
  me,
  members,
}: {
  household: HouseholdDetail
  me: MyMembership
  members: HouseholdMember[]
}) {
  const isAdult = !isMinorRole(me.role)
  const canInvite = me.permissions.includes('invite_members')
  const canAddChildren = me.permissions.includes('manage_children')

  return (
    <Shell>
      <Stack $gap={7}>
        <Header>
          <Stack $gap={2}>
            <PageTitle>{household.name}</PageTitle>
            <Row $gap={3}>
              {placeLine(household) && <Muted as="span">{placeLine(household)}</Muted>}
              <Pill>
                <StatusDot $tone={household.visibility === 'public' ? 'sky' : 'grass'} />
                {HOUSEHOLD_VISIBILITY_LABELS[household.visibility]}
              </Pill>
            </Row>
            {household.bio && <Text>{household.bio}</Text>}
          </Stack>
          {isAdult && (
            <ButtonLink to="settings" relative="path" $variant="secondary" $size="sm">
              Settings
            </ButtonLink>
          )}
        </Header>

        {canInvite || canAddChildren ? (
          <TopAligned $columns={2} $gap={5}>
            <MembersCard householdId={household.id} me={me} members={members} />
            <Stack $gap={5}>
              {canInvite && <InviteCard householdId={household.id} me={me} />}
              {canAddChildren && <AddChildCard householdId={household.id} />}
            </Stack>
          </TopAligned>
        ) : (
          <MembersCard householdId={household.id} me={me} members={members} />
        )}

        <ComingSoon />
      </Stack>
    </Shell>
  )
}

const FEATURES: { title: string; icon: IconName; tone: Accent }[] = [
  { title: 'Lists', icon: 'lists', tone: 'sky' },
  { title: 'Chores & rewards', icon: 'chores', tone: 'yellow' },
  { title: 'Shared calendar', icon: 'calendar', tone: 'grape' },
  { title: 'Family chat', icon: 'chat', tone: 'coral' },
  { title: 'Expenses & budgets', icon: 'money', tone: 'grass' },
  { title: 'Document vault', icon: 'vault', tone: 'sky' },
  { title: 'Home inventory', icon: 'home', tone: 'yellow' },
  { title: 'Memories', icon: 'memories', tone: 'grape' },
]

function ComingSoon() {
  return (
    <Stack $gap={4}>
      <CardTitle as="h2">Coming to your household</CardTitle>
      <Grid $columns={4} $gap={4}>
        {FEATURES.map((feature) => (
          <Card key={feature.title} $variant="plain" $padding="md">
            <Tile>
              <IconChip $tone={feature.tone} $size={36} aria-hidden="true">
                <Icon name={feature.icon} size={18} />
              </IconChip>
              <div>
                <TileTitle>{feature.title}</TileTitle>
                <Muted>Coming soon</Muted>
              </div>
            </Tile>
          </Card>
        ))}
      </Grid>
    </Stack>
  )
}

function PublicHousehold({ household }: { household: PublicHouseholdProfile }) {
  return (
    <Shell>
      <Card $padding="lg">
        <Stack $gap={3}>
          <Row $gap={3}>
            <Pill>
              <StatusDot $tone="sky" />
              Public household
            </Pill>
          </Row>
          <PageTitle>{household.name}</PageTitle>
          {placeLine(household) && <Muted>{placeLine(household)}</Muted>}
          {household.bio && <Text>{household.bio}</Text>}
        </Stack>
      </Card>
    </Shell>
  )
}

const TopAligned = styled(Grid)`
  align-items: start;
`

const Tile = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;

  > span {
    flex-shrink: 0;
  }
`

const TileTitle = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]}px;
`
