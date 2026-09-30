import { Navigate, useNavigate } from 'react-router'

import { CardPage } from '../components/app/CardPage'
import { ButtonLink, Muted, Text } from '../components/ui'
import { CreateHouseholdForm } from '../features/households/CreateHouseholdForm'
import { useMyHouseholds } from '../features/households/queries'
import { pendingInvite } from '../features/invites/pending-invite'
import { locationFromPlace } from '../features/places/location'
import { useMe } from '../features/profile/queries'

/**
 * /households/new: the step right after sign-up (first household), and the
 * place to create another one later.
 */
export function NewHouseholdPage() {
  const navigate = useNavigate()
  const me = useMe()
  const households = useMyHouseholds()

  // Wait for the profile so the form starts with the home city filled in.
  if (me.isPending || households.isPending) {
    return (
      <CardPage title="Create a household">
        <Muted>Loading…</Muted>
      </CardPage>
    )
  }

  if (me.isError || households.isError) {
    return (
      <CardPage title="Create a household">
        <Text>We couldn’t load your account. Please try again in a moment.</Text>
      </CardPage>
    )
  }

  if (me.data.accountType === 'child') {
    return (
      <CardPage
        title="Households are set up by parents"
        intro="Ask a parent if you’d like to be added to another household."
      >
        <ButtonLink to="/app" $variant="secondary">
          Go to your household
        </ButtonLink>
      </CardPage>
    )
  }

  // Finish joining the household they were invited to before starting a new one.
  if (pendingInvite()) return <Navigate to="/invite" replace />

  const isFirst = households.data.length === 0
  const firstName = me.data.firstName

  return (
    <CardPage
      wide
      title={
        isFirst ? (firstName ? `Welcome, ${firstName}` : 'Welcome') : 'Create another household'
      }
      intro={
        isFirst
          ? 'Start by setting up your household. You can invite family and add children once it exists.'
          : 'Each household has its own members, privacy settings and address.'
      }
    >
      <CreateHouseholdForm
        initialLocation={locationFromPlace(me.data.place, me.data.cityId)}
        onCreated={() => void navigate('/app', { replace: true })}
      />
      <Muted>
        Joining a household someone else set up? Open the invite link they sent you instead.
      </Muted>
    </CardPage>
  )
}
