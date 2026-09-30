import { HOUSEHOLD_VISIBILITY_LABELS, ROLE_LABELS, householdPath } from '@households/shared'
import type { Accent } from '@households/theme'
import { Link, Navigate } from 'react-router'
import styled from 'styled-components'

import { AppHeader } from '../components/app/AppHeader'
import { Icon } from '../components/icons'
import {
  Button,
  ButtonLink,
  Card,
  CardList,
  CardTitle,
  IconChip,
  Muted,
  Page,
  PageTitle,
  Stack,
  Text,
} from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { useMyHouseholds } from '../features/households/queries'
import { pendingInvite } from '../features/invites/pending-invite'
import { useMe } from '../features/profile/queries'

const tones: Accent[] = ['yellow', 'sky', 'grass', 'grape', 'coral']

export function DashboardPage() {
  const { signOut } = useAuth()
  const households = useMyHouseholds()
  const me = useMe()
  const isChild = me.data?.accountType === 'child'

  // Someone who opened an invite link before signing up finishes joining first.
  if (pendingInvite() && !isChild) return <Navigate to="/invite" replace />
  // New accounts go straight to setting up their first household.
  if (households.data?.length === 0 && me.data && !isChild) {
    return <Navigate to="/households/new" replace />
  }

  return (
    <>
      <AppHeader
        actions={
          <Button $variant="ghost" $size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        }
      />
      <Page>
        <Stack $gap={6}>
          <Header>
            <PageTitle>{isChild ? 'Your household' : 'Your households'}</PageTitle>
            {me.data && !isChild && (
              <ButtonLink to="/households/new" $variant="secondary" $size="sm">
                Create a household
              </ButtonLink>
            )}
          </Header>

          <Card $variant="plain" $padding="md">
            {households.isPending && <Muted>Loading…</Muted>}
            {households.isError && (
              <Text>We couldn’t load your households. Please try again in a moment.</Text>
            )}
            {households.data?.length === 0 && (
              <Text>You’re not in a household right now. Ask a parent to add you.</Text>
            )}
            {households.data && households.data.length > 0 && (
              <HouseholdList>
                {households.data.map((household, i) => (
                  <li key={household.id}>
                    <IconChip $tone={tones[i % tones.length] ?? 'yellow'}>
                      <Icon name="home" size={22} />
                    </IconChip>
                    <div>
                      <CardTitle>
                        {household.place ? (
                          <Link to={householdPath(household.place, household.slug)}>
                            {household.name}
                          </Link>
                        ) : (
                          household.name
                        )}
                      </CardTitle>
                      <Muted>
                        {[
                          ROLE_LABELS[household.myRole],
                          HOUSEHOLD_VISIBILITY_LABELS[household.visibility],
                          household.place &&
                            `${household.place.cityName}, ${household.place.regionName}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Muted>
                    </div>
                  </li>
                ))}
              </HouseholdList>
            )}
          </Card>
        </Stack>
      </Page>
    </>
  )
}

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const HouseholdList = styled(CardList)`
  > li {
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.space[4]}px;
  }

  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  > li:last-child {
    padding-bottom: 0;
  }

  a {
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`
