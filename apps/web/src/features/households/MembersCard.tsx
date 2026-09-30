import {
  assignableRoles,
  canRemoveMember,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AssignableRole,
  type HouseholdMember,
  type MyMembership,
} from '@households/shared'
import { useState } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  ConfirmButton,
  ErrorText,
  Muted,
  Row,
  Select,
  Stack,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { ChildCode } from './ChildCode'
import { useChildSignInCode, useRemoveChild, useRemoveMember, useSetMemberRole } from './queries'

interface MembersCardProps {
  householdId: string
  me: MyMembership
  members: HouseholdMember[]
}

export function MembersCard({ householdId, me, members }: MembersCardProps) {
  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Members</CardTitle>
        <List>
          {members.map((member) => (
            <MemberRow key={member.profileId} householdId={householdId} me={me} member={member} />
          ))}
        </List>
      </Stack>
    </Card>
  )
}

function MemberRow({
  householdId,
  me,
  member,
}: {
  householdId: string
  me: MyMembership
  member: HouseholdMember
}) {
  const [open, setOpen] = useState(false)
  const roles = assignableRoles(me, member)
  const isChild = member.accountType === 'child'
  const canManageChild = isChild && me.permissions.includes('manage_children')
  const manageable = roles.length > 0 || canRemoveMember(me, member) || canManageChild

  return (
    <li>
      <Summary>
        <div>
          <Name>
            {member.displayName}
            {member.isMe && <Muted as="span"> (you)</Muted>}
          </Name>
          <Muted>{ROLE_LABELS[member.role]}</Muted>
        </div>
        {manageable && (
          <Button
            type="button"
            $variant="ghost"
            $size="sm"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Done' : 'Manage'}
          </Button>
        )}
      </Summary>
      {open && (
        <Panel>
          {isChild ? (
            <ChildControls householdId={householdId} member={member} roles={roles} />
          ) : (
            <AdultControls householdId={householdId} me={me} member={member} roles={roles} />
          )}
        </Panel>
      )}
    </li>
  )
}

function RoleControl({
  householdId,
  member,
  roles,
}: {
  householdId: string
  member: HouseholdMember
  roles: AssignableRole[]
}) {
  const [role, setRole] = useState<AssignableRole>(
    roles.find((r) => r === member.role) ?? roles[0] ?? 'adult',
  )
  const setMemberRole = useSetMemberRole(householdId)
  if (roles.length === 0) return null

  return (
    <Stack $gap={3}>
      <Select
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as AssignableRole)}
        hint={ROLE_DESCRIPTIONS[role]}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {setMemberRole.isError && (
        <ErrorText role="alert">{apiErrorMessage(setMemberRole.error)}</ErrorText>
      )}
      <Row>
        <Button
          type="button"
          $size="sm"
          disabled={role === member.role || setMemberRole.isPending}
          onClick={() => setMemberRole.mutate({ profileId: member.profileId, role })}
        >
          {setMemberRole.isPending ? 'Saving…' : 'Save role'}
        </Button>
      </Row>
    </Stack>
  )
}

function AdultControls({
  householdId,
  me,
  member,
  roles,
}: {
  householdId: string
  me: MyMembership
  member: HouseholdMember
  roles: AssignableRole[]
}) {
  const removeMember = useRemoveMember(householdId)
  return (
    <Stack $gap={4}>
      <RoleControl householdId={householdId} member={member} roles={roles} />
      {canRemoveMember(me, member) && (
        <Stack $gap={2} $align="start">
          <ConfirmButton
            message={`${member.displayName} will lose access to this household. You can invite them again later.`}
            confirmLabel={`Yes, remove ${member.displayName}`}
            busy={removeMember.isPending}
            onConfirm={() => removeMember.mutate(member.profileId)}
          >
            Remove from household
          </ConfirmButton>
          {removeMember.isError && (
            <ErrorText role="alert">{apiErrorMessage(removeMember.error)}</ErrorText>
          )}
        </Stack>
      )}
    </Stack>
  )
}

function ChildControls({
  householdId,
  member,
  roles,
}: {
  householdId: string
  member: HouseholdMember
  roles: AssignableRole[]
}) {
  const signInCode = useChildSignInCode(householdId)
  const removeChild = useRemoveChild(householdId)

  return (
    <Stack $gap={4}>
      {signInCode.data ? (
        <ChildCode
          childName={member.displayName}
          code={signInCode.data.signIn.code}
          expiresAt={signInCode.data.signIn.expiresAt}
        />
      ) : (
        <Stack $gap={2} $align="start">
          <Muted>For a new device, or if {member.displayName} got signed out.</Muted>
          <Button
            type="button"
            $variant="secondary"
            $size="sm"
            disabled={signInCode.isPending}
            onClick={() => signInCode.mutate(member.profileId)}
          >
            {signInCode.isPending ? 'Creating…' : 'Show a sign-in code'}
          </Button>
        </Stack>
      )}
      {signInCode.isError && (
        <ErrorText role="alert">{apiErrorMessage(signInCode.error)}</ErrorText>
      )}

      <RoleControl householdId={householdId} member={member} roles={roles} />

      <Stack $gap={2} $align="start">
        <ConfirmButton
          message={`This deletes ${member.displayName}’s account and everything in it, and signs them out everywhere. It can’t be undone.`}
          confirmLabel={`Yes, delete ${member.displayName}’s account`}
          busy={removeChild.isPending}
          onConfirm={() => removeChild.mutate(member.profileId)}
        >
          Delete child account
        </ConfirmButton>
        {removeChild.isError && (
          <ErrorText role="alert">{apiErrorMessage(removeChild.error)}</ErrorText>
        )}
      </Stack>
    </Stack>
  )
}

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  > li:last-child {
    padding-bottom: 0;
  }
`

const Summary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Name = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Panel = styled.div`
  margin-top: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
`
