import {
  deviceTimeZone,
  HOUSEHOLD_VISIBILITY_LABELS,
  isMinorRole,
  type HouseholdDetail,
  type HouseholdMember,
  type HouseholdView,
  type MyMembership,
  type PublicHouseholdProfile,
} from '@households/shared'
import type { Accent } from '@households/theme'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import styled from 'styled-components'

import { AppHeader } from '../components/app/AppHeader'
import { Icon, type IconName } from '../components/icons'
import {
  ButtonLink,
  Card,
  Grid,
  IconChip,
  Muted,
  Page,
  PageTitle,
  Pill,
  Row,
  Stack,
  StatusDot,
  StatusText,
  Text,
} from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { AddChildCard } from '../features/households/AddChildCard'
import { InviteCard } from '../features/households/InviteCard'
import { MembersCard } from '../features/households/MembersCard'
import { TodayOverview } from '../features/households/TodayOverview'
import {
  useHouseholdView,
  useUpdateHousehold,
  type AddressParams,
} from '../features/households/queries'
import { NotFoundPage } from './NotFoundPage'

/**
 * households.xyz/:country/:region/:city/:name. Members see their household;
 * everyone else sees a public profile if there is one, and otherwise the same
 * "not found" as for an address that doesn't exist.
 */
export function HouseholdPage() {
  const { status, needsSecondFactor } = useAuth()
  const location = useLocation()
  const params = useParams()
  const address: AddressParams = {
    country: params.country ?? '',
    region: params.region ?? '',
    city: params.city ?? '',
    name: params.name ?? '',
  }
  const view = useHouseholdView(
    address,
    status === 'signed-in',
    status !== 'loading' && !needsSecondFactor,
  )

  if (status === 'signed-in' && needsSecondFactor) {
    return (
      <Navigate to={`/sign-in/verify?returnTo=${encodeURIComponent(location.pathname)}`} replace />
    )
  }

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
          pendingApprovals={view.pendingApprovals}
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
  pendingApprovals,
}: {
  household: HouseholdDetail
  me: MyMembership
  members: HouseholdMember[]
  /** Chores and reward requests waiting for me to check. */
  pendingApprovals: number
}) {
  const isAdult = !isMinorRole(me.role)
  const canInvite = me.permissions.includes('invite_members')
  const canAddChildren = me.permissions.includes('manage_children')
  useHomeTimeZone(household, me)

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

        <Features
          waiting={{ chores: pendingApprovals }}
          blurbs={me.permissions.includes('view_expenses') ? {} : { money: 'Your pocket money' }}
        />

        <TodayOverview householdId={household.id} members={members} />

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
      </Stack>
    </Shell>
  )
}

const FEATURES: { title: string; icon: IconName; tone: Accent; path: string; blurb: string }[] = [
  { title: 'Lists', icon: 'lists', tone: 'sky', path: 'lists', blurb: 'To-dos, shopping, packing' },
  {
    title: 'Chores & rewards',
    icon: 'chores',
    tone: 'yellow',
    path: 'chores',
    blurb: 'Chores, points and rewards',
  },
  {
    title: 'Calendar',
    icon: 'calendar',
    tone: 'grape',
    path: 'calendar',
    blurb: 'Plans, due dates, meals',
  },
  {
    title: 'Meals',
    icon: 'meals',
    tone: 'coral',
    path: 'meals',
    blurb: 'Plan the week, shop once',
  },
  { title: 'Chat', icon: 'chat', tone: 'sky', path: 'chat', blurb: 'Just the household' },
  {
    title: 'Money',
    icon: 'money',
    tone: 'grass',
    path: 'money',
    blurb: 'Bills, budgets, pocket money',
  },
  {
    title: 'Documents',
    icon: 'vault',
    tone: 'grape',
    path: 'documents',
    blurb: 'Papers and expiry dates',
  },
]

const COMING_SOON = ['Home inventory', 'Memories']

/**
 * Reminders follow the household's clock. Until someone sets it, the first
 * person who can sets it to their device's zone (they can change it in
 * settings).
 */
function useHomeTimeZone(household: HouseholdDetail, me: MyMembership) {
  const update = useUpdateHousehold(household.id)
  const tried = useRef(false)
  const canSet = me.permissions.includes('manage_household')
  useEffect(() => {
    if (household.timeZone !== null || !canSet || tried.current) return
    tried.current = true
    update.mutate({ timeZone: deviceTimeZone() })
  }, [household.timeZone, canSet, update])
}

/**
 * What the household can do, and what's on its way. A feature with
 * something waiting for you says so.
 */
function Features({
  waiting,
  blurbs,
}: {
  waiting: Partial<Record<string, number>>
  /** Per-person wording, by path. */
  blurbs: Partial<Record<string, string>>
}) {
  return (
    <Stack $gap={3}>
      <Grid $columns={4} $gap={4}>
        {FEATURES.map((feature) => {
          const count = waiting[feature.path] ?? 0
          return (
            <TileLink key={feature.title} to={feature.path} relative="path">
              <Card $padding="md">
                <Tile>
                  <IconChip $tone={feature.tone} $size={36} aria-hidden="true">
                    <Icon name={feature.icon} size={18} />
                  </IconChip>
                  <div>
                    <TileTitle>{feature.title}</TileTitle>
                    {count > 0 ? (
                      <StatusText $status="warning">{count} waiting for you</StatusText>
                    ) : (
                      <Muted>{blurbs[feature.path] ?? feature.blurb}</Muted>
                    )}
                  </div>
                </Tile>
              </Card>
            </TileLink>
          )
        })}
      </Grid>
      <Muted>Coming soon: {COMING_SOON.join(' · ')}</Muted>
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

const TileLink = styled(Link)`
  display: block;
  height: 100%;

  > div {
    height: 100%;
  }

  color: inherit;
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radii.lg}px;

  &:hover p:first-child {
    text-decoration: underline;
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
