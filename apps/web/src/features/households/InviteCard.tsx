import {
  INVITE_TTL_DAYS,
  invitableRoles,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type InviteRole,
  type MyMembership,
} from '@households/shared'
import { useState } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  CopyField,
  ErrorText,
  Muted,
  Select,
  Stack,
  Text,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDate } from '../../lib/format'
import { useCreateInvite, useInvites, useRevokeInvite } from './queries'

/**
 * Invite links for adults. The token goes after '#' in the link, so it never
 * reaches a server or its logs, and it works once.
 */
export function InviteCard({ householdId, me }: { householdId: string; me: MyMembership }) {
  const roles = invitableRoles(me)
  const [role, setRole] = useState<InviteRole>('adult')
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const createInvite = useCreateInvite(householdId)
  const invites = useInvites(householdId, roles.length > 0)
  const revokeInvite = useRevokeInvite(householdId)

  if (roles.length === 0) return null

  async function onCreate() {
    const { invite } = await createInvite.mutateAsync(role)
    setLink({
      url: `${window.location.origin}/invite#${invite.token}`,
      expiresAt: invite.expiresAt,
    })
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={2}>
          <CardTitle>Invite people</CardTitle>
          <Muted>
            For adults. Each link works once, for {INVITE_TTL_DAYS} days. Send it privately, like in
            a direct message.
          </Muted>
        </Stack>

        <Select
          label="They join as"
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
          hint={ROLE_DESCRIPTIONS[role]}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>

        {createInvite.isError && (
          <ErrorText role="alert">{apiErrorMessage(createInvite.error)}</ErrorText>
        )}
        <Button
          type="button"
          $fullWidth
          disabled={createInvite.isPending}
          onClick={() => void onCreate().catch(() => undefined)}
        >
          {createInvite.isPending ? 'Creating…' : 'Create invite link'}
        </Button>

        {link && (
          <CopyField
            label="Invite link"
            value={link.url}
            hint={`Works once, until ${formatDate(link.expiresAt)}. We can’t show it again.`}
          />
        )}

        {invites.data && invites.data.length > 0 && (
          <Stack $gap={2}>
            <Text>Open invites</Text>
            <List>
              {invites.data.map((invite) => (
                <li key={invite.id}>
                  <Muted as="span">
                    {ROLE_LABELS[invite.role]} · until {formatDate(invite.expiresAt)}
                    {invite.createdByName && ` · from ${invite.createdByName}`}
                  </Muted>
                  <Button
                    type="button"
                    $variant="ghost"
                    $size="sm"
                    disabled={revokeInvite.isPending}
                    onClick={() => revokeInvite.mutate(invite.id)}
                  >
                    Cancel invite
                  </Button>
                </li>
              ))}
            </List>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

const List = styled(CardList)`
  > li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${({ theme }) => theme.space[3]}px;
  }
`
