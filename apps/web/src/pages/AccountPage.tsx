import { AppHeader } from '../components/app/AppHeader'
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  Muted,
  Page,
  PageTitle,
  Stack,
  Text,
} from '../components/ui'
import { DataSection, DeleteAccountSection } from '../features/account/DataSections'
import {
  EmailSection,
  PersonalDetailsSection,
  ProfileSection,
} from '../features/account/ProfileSections'
import {
  PasswordSection,
  SessionsSection,
  TwoStepSection,
} from '../features/account/SecuritySections'
import { useAuth } from '../features/auth/auth-context'
import { useMe } from '../features/profile/queries'

/** /account: everything about you. Calm on purpose: no playful type here (DESIGN.md §12). */
export function AccountPage() {
  const { session, signOut } = useAuth()
  const me = useMe()
  const email = session?.user.email ?? ''

  return (
    <>
      <AppHeader
        actions={
          <ButtonLink to="/app" $variant="ghost" $size="sm">
            Your households
          </ButtonLink>
        }
      />
      <Page $medium>
        <Stack $gap={6}>
          <PageTitle>Your account</PageTitle>
          {me.isPending && <Muted>Loading…</Muted>}
          {me.isError && <Text>We couldn’t load your account. Please try again in a moment.</Text>}
          {me.data?.accountType === 'child' && (
            <Card $padding="lg">
              <Stack $gap={3} $align="start">
                <CardTitle>{me.data.displayName}</CardTitle>
                <Text>
                  Your parents look after your account. Ask them if you’d like to change something.
                </Text>
                <Button type="button" $variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </Stack>
            </Card>
          )}
          {me.data?.accountType === 'standard' && (
            <>
              <ProfileSection me={me.data} />
              <PersonalDetailsSection me={me.data} />
              <EmailSection email={email} />
              <PasswordSection />
              <TwoStepSection />
              <SessionsSection />
              <DataSection />
              <DeleteAccountSection email={email} />
            </>
          )}
        </Stack>
      </Page>
    </>
  )
}
