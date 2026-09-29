import { Constants, type Enums } from '@households/db'
import { z } from 'zod'

export type HouseholdRole = Enums<'household_role'>
export type HouseholdPermission = Enums<'household_permission'>
export type MembershipStatus = Enums<'membership_status'>
export type AccountType = Enums<'account_type'>

export const HOUSEHOLD_ROLES = Constants.public.Enums.household_role
export const HOUSEHOLD_PERMISSIONS = Constants.public.Enums.household_permission

export const householdRoleSchema = z.enum(HOUSEHOLD_ROLES)
export const householdPermissionSchema = z.enum(HOUSEHOLD_PERMISSIONS)

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  owner: 'Owner',
  admin: 'Parent / Admin',
  adult: 'Adult',
  teen: 'Teen',
  child: 'Child',
  caregiver: 'Caregiver',
  guest: 'Guest',
}

export const PERMISSION_LABELS: Record<HouseholdPermission, string> = {
  manage_household: 'Edit household profile & settings',
  invite_members: 'Invite members',
  manage_members: 'Manage members & roles',
  manage_children: 'Manage children’s accounts',
  create_posts: 'Post to the household',
  moderate_content: 'Moderate posts & comments',
  publish_public: 'Publish content outside the household',
  view_expenses: 'View expenses & budgets',
  manage_expenses: 'Manage expenses & budgets',
  view_documents: 'View the document vault',
  manage_documents: 'Manage the document vault',
  manage_chores: 'Create & assign chores',
  manage_calendar: 'Manage the household calendar',
}

/**
 * Default permissions per role. Mirrors the `household_role_permissions` seed
 * in the core migration (a unit test keeps them identical). The database is
 * authoritative: for real decisions call the `my_household_permissions` RPC.
 * These defaults are for UI hints, such as explaining a role before inviting.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<HouseholdRole, readonly HouseholdPermission[]> = {
  owner: HOUSEHOLD_PERMISSIONS,
  admin: HOUSEHOLD_PERMISSIONS,
  adult: [
    'invite_members',
    'create_posts',
    'view_expenses',
    'manage_expenses',
    'view_documents',
    'manage_chores',
    'manage_calendar',
  ],
  teen: ['create_posts'],
  child: ['create_posts'],
  caregiver: ['create_posts', 'manage_chores', 'manage_calendar'],
  guest: [],
}

/** Extra permissions a child may ever be granted (DB check constraint mirrors this). */
export const CHILD_GRANTABLE_PERMISSIONS: readonly HouseholdPermission[] = ['create_posts']

/** Roles for minors: never publicly discoverable, messaging and sharing are parent-controlled. */
export function isMinorRole(role: HouseholdRole): boolean {
  return role === 'child' || role === 'teen'
}

export interface MemberPermissionInput {
  role: HouseholdRole
  status: MembershipStatus
  grantedPermissions?: readonly HouseholdPermission[]
  revokedPermissions?: readonly HouseholdPermission[]
}

/** Same rules as `private.has_household_permission` in the database. */
export function resolveEffectivePermissions(
  member: MemberPermissionInput,
): ReadonlySet<HouseholdPermission> {
  if (member.status !== 'active') return new Set()
  if (member.role === 'owner') return new Set(HOUSEHOLD_PERMISSIONS)

  const revoked = new Set(member.revokedPermissions ?? [])
  const effective = new Set<HouseholdPermission>()
  for (const p of [
    ...ROLE_DEFAULT_PERMISSIONS[member.role],
    ...(member.grantedPermissions ?? []),
  ]) {
    if (!revoked.has(p)) effective.add(p)
  }
  return effective
}

export function hasPermission(
  permissions: ReadonlySet<HouseholdPermission> | readonly HouseholdPermission[],
  permission: HouseholdPermission,
): boolean {
  return 'has' in permissions ? permissions.has(permission) : permissions.includes(permission)
}
