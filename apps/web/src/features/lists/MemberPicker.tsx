import type { HouseholdMember } from '@households/shared'

import { Checkbox, ErrorText, FieldGroup, Muted } from '../../components/ui'

/** Choose who else can see a selected-members list. */
export function MemberPicker({
  members,
  selected,
  onChange,
  error,
}: {
  members: HouseholdMember[]
  selected: readonly string[]
  onChange: (ids: string[]) => void
  error?: string | undefined
}) {
  const others = members.filter((member) => !member.isMe)
  const toggle = (profileId: string, on: boolean) =>
    onChange(on ? [...selected, profileId] : selected.filter((id) => id !== profileId))

  return (
    <FieldGroup legend="Who else can see it">
      {others.length === 0 ? (
        <Muted>There’s nobody else in the household yet.</Muted>
      ) : (
        others.map((member) => (
          <Checkbox
            key={member.profileId}
            checked={selected.includes(member.profileId)}
            onChange={(e) => toggle(member.profileId, e.target.checked)}
          >
            {member.displayName}
          </Checkbox>
        ))
      )}
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </FieldGroup>
  )
}
