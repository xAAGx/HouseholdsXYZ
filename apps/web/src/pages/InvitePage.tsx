import { inviteTokenSchema, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@households/shared'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { CardPage } from '../components/app/CardPage'
import { Button, ButtonLink, ErrorText, Muted, Row, Stack, Text } from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { forgetInvite, pendingInvite, rememberInvite } from '../features/invites/pending-invite'
import { useAcceptInvite, useInvitePreview } from '../features/invites/queries'
import { apiErrorMessage } from '../lib/api-errors'

/** The token from /invite#<token>, remembered so it survives signing up. */
function readToken(): string | null {
  const fromLink = window.location.hash.slice(1)
  if (inviteTokenSchema.safeParse(fromLink).success) {
    rememberInvite(fromLink)
    return fromLink
  }
  return pendingInvite()
}

/**
 * /invite#<token>. The token sits after '#', so browsers never send it to a
 * server. Signed-out visitors are asked to sign in or create an account first.
 */
export function InvitePage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [token] = useState(readToken)
  const preview = useInvitePreview(status === 'signed-in' ? token : null)
  const accept = useAcceptInvite()

  // Drop the token from the address bar and history once it's remembered.
  useEffect(() => {
    if (window.location.hash) void navigate('/invite', { replace: true })
  }, [navigate])

  if (!token) {
    return (
      <CardPage
        title="This invite link is incomplete"
        intro="Part of the link is missing. Ask the person who invited you to send it again."
      >
        <ButtonLink to="/app" $variant="secondary">
          Go to your households
        </ButtonLink>
      </CardPage>
    )
  }

  if (status === 'loading' || (status === 'signed-in' && preview.isPending)) {
    return (
      <CardPage title="You’re invited">
        <Muted>Loading…</Muted>
      </CardPage>
    )
  }

  if (status === 'signed-out') {
    return (
      <CardPage
        title="You’re invited"
        intro="Create an account or sign in to see the invite and join the household."
      >
        <Stack $gap={3}>
          <ButtonLink to="/sign-up" $size="lg" $fullWidth>
            Create an account
          </ButtonLink>
          <ButtonLink to="/sign-in?returnTo=%2Finvite" $variant="secondary" $size="lg" $fullWidth>
            Sign in
          </ButtonLink>
          <Muted>We’ll bring you back to this invite afterwards, in this browser.</Muted>
        </Stack>
      </CardPage>
    )
  }

  if (preview.isError || !preview.data) {
    return (
      <CardPage
        title="This invite link doesn’t work anymore"
        intro="It may have expired or been used already. Invite links work once, for 7 days. Ask for a new one."
      >
        <ButtonLink to="/app" $variant="secondary" onClick={forgetInvite}>
          Go to your households
        </ButtonLink>
      </CardPage>
    )
  }

  const invite = preview.data
  const place = invite.cityName ? `${invite.cityName}, ${invite.regionName ?? ''}` : null

  async function onAccept(inviteToken: string) {
    const { path } = await accept.mutateAsync(inviteToken)
    forgetInvite()
    await navigate(path ?? '/app', { replace: true })
  }

  return (
    <CardPage
      title={invite.alreadyMember ? 'You’re already a member' : `Join ${invite.householdName}`}
      intro={
        invite.alreadyMember
          ? `You’re already in ${invite.householdName}.`
          : `${invite.invitedBy ?? 'A member'} invited you${place ? ` to their household in ${place}` : ''}.`
      }
    >
      <Stack $gap={4}>
        {!invite.alreadyMember && (
          <Stack $gap={1}>
            <Text>
              You’ll join as <strong>{ROLE_LABELS[invite.role]}</strong>.
            </Text>
            <Muted>{ROLE_DESCRIPTIONS[invite.role]}</Muted>
          </Stack>
        )}
        {accept.isError && <ErrorText role="alert">{apiErrorMessage(accept.error)}</ErrorText>}
        <Row>
          <Button
            type="button"
            $size="lg"
            disabled={accept.isPending}
            onClick={() => void onAccept(token).catch(() => undefined)}
          >
            {invite.alreadyMember
              ? 'Open household'
              : accept.isPending
                ? 'Joining…'
                : 'Join household'}
          </Button>
          <ButtonLink to="/app" $variant="ghost" $size="lg" onClick={forgetInvite}>
            Not now
          </ButtonLink>
        </Row>
      </Stack>
    </CardPage>
  )
}
