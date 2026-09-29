import { HOUSEHOLD_VISIBILITY_LABELS, ROLE_LABELS, householdPath } from '@households/shared'
import type { Accent } from '@households/theme'
import { Link } from 'react-router'
import styled from 'styled-components'

import { AppHeader } from '../components/app/AppHeader'
import { Icon } from '../components/icons'
import {
  Button,
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
import { CreateHouseholdForm } from '../features/households/CreateHouseholdForm'
import { useMyHouseholds } from '../features/households/queries'

const tones: Accent[] = ['yellow', 'sky', 'grass', 'grape', 'coral']

export function DashboardPage() {
  const { signOut } = useAuth()
  const households = useMyHouseholds()

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
          <PageTitle>Your households</PageTitle>

          <Card $variant="plain" $padding="md">
            {households.isPending && <Muted>Loading…</Muted>}
            {households.isError && (
              <Text>We couldn’t load your households. Please try again in a moment.</Text>
            )}
            {households.data?.length === 0 && (
              <Text>You’re not part of a household yet. Create one below.</Text>
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
                        <Link to={householdPath(household.slug)}>{household.name}</Link>
                      </CardTitle>
                      <Muted>
                        {ROLE_LABELS[household.myRole]} ·{' '}
                        {HOUSEHOLD_VISIBILITY_LABELS[household.visibility]}
                      </Muted>
                    </div>
                  </li>
                ))}
              </HouseholdList>
            )}
          </Card>

          <Card $padding="lg">
            <Stack $gap={4}>
              <CardTitle>Create a household</CardTitle>
              <CreateHouseholdForm />
            </Stack>
          </Card>
        </Stack>
      </Page>
    </>
  )
}

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
