import { z } from 'zod'

import type { AccountType, HouseholdPermission, HouseholdRole } from '../permissions/roles'

// Who can do what to whom. The database decides (set_household_member_role,
// create_household_invite and the household_members policies); these mirror
// its rules so the UI only offers actions that will succeed.

/** Roles for adult accounts, in the order the UI lists them. */
export const ADULT_ROLES = ['adult', 'caregiver', 'guest', 'admin'] as const
/** Roles for parent-managed child accounts. */
export const CHILD_ROLES = ['child', 'teen'] as const

/** Roles an invite link can give. Children get parent-managed accounts instead. */
export const inviteRoleSchema = z.enum(ADULT_ROLES)
export type InviteRole = z.infer<typeof inviteRoleSchema>

export const INVITE_TTL_DAYS = 7

export const createInviteInputSchema = z.strictObject({ role: inviteRoleSchema })

/** The secret part of an invite link: 64 hex characters, after the '#'. */
export const inviteTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'This invite link is incomplete. Ask for a new one.')
export const inviteTokenInputSchema = z.strictObject({ token: inviteTokenSchema })

export const setMemberRoleInputSchema = z.strictObject({
  role: z.enum([...ADULT_ROLES, ...CHILD_ROLES]),
})
/** Any role but owner: ownership moves through its own flow. */
export type AssignableRole = z.infer<typeof setMemberRoleInputSchema>['role']

export interface MyMembership {
  role: HouseholdRole
  permissions: readonly HouseholdPermission[]
}

export interface MemberTarget {
  role: HouseholdRole
  accountType: AccountType
  isMe: boolean
}

/** Roles I can put in an invite link. */
export function invitableRoles(me: MyMembership): InviteRole[] {
  if (!me.permissions.includes('invite_members')) return []
  return ADULT_ROLES.filter((role) => role !== 'admin' || me.role === 'owner')
}

/** Roles I can give an existing member (empty when I can't change theirs). */
export function assignableRoles(me: MyMembership, member: MemberTarget): AssignableRole[] {
  if (member.isMe || member.role === 'owner') return []
  if (member.accountType === 'child') {
    return me.permissions.includes('manage_members') && me.permissions.includes('manage_children')
      ? [...CHILD_ROLES]
      : []
  }
  if (!me.permissions.includes('manage_members')) return []
  if (me.role === 'owner') return [...ADULT_ROLES]
  return member.role === 'admin' ? [] : ADULT_ROLES.filter((role) => role !== 'admin')
}

/** Whether I can remove an adult member (children are removed with their account). */
export function canRemoveMember(me: MyMembership, member: MemberTarget): boolean {
  if (member.isMe || member.role === 'owner' || member.accountType === 'child') return false
  if (!me.permissions.includes('manage_members')) return false
  return member.role !== 'admin' || me.role === 'owner'
}

/** A household member as other members see them. */
export interface HouseholdMember {
  profileId: string
  displayName: string
  role: HouseholdRole
  accountType: AccountType
  joinedAt: string | null
  isMe: boolean
}

/** An open invite link, as inviters see it (never the token). */
export interface HouseholdInvite {
  id: string
  role: HouseholdRole
  expiresAt: string
  createdByName: string | null
}

/** What an invite link is for, shown before accepting. */
export interface InvitePreview {
  householdName: string
  cityName: string | null
  regionName: string | null
  role: HouseholdRole
  invitedBy: string | null
  expiresAt: string
  alreadyMember: boolean
}
