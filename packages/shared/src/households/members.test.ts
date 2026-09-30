import { describe, expect, it } from 'vitest'

import { ROLE_DEFAULT_PERMISSIONS } from '../permissions/roles'
import {
  assignableRoles,
  canRemoveMember,
  invitableRoles,
  inviteTokenSchema,
  type MemberTarget,
  type MyMembership,
} from './members'

const as = (role: 'owner' | 'admin' | 'adult' | 'caregiver'): MyMembership => ({
  role,
  permissions: ROLE_DEFAULT_PERMISSIONS[role],
})

const adult: MemberTarget = { role: 'adult', accountType: 'standard', isMe: false }
const admin: MemberTarget = { role: 'admin', accountType: 'standard', isMe: false }
const child: MemberTarget = { role: 'child', accountType: 'child', isMe: false }

describe('invitableRoles', () => {
  it('lets only the owner invite admins', () => {
    expect(invitableRoles(as('owner'))).toContain('admin')
    expect(invitableRoles(as('admin'))).not.toContain('admin')
    expect(invitableRoles(as('adult'))).toEqual(['adult', 'caregiver', 'guest'])
  })

  it('offers nothing without invite_members', () => {
    expect(invitableRoles(as('caregiver'))).toEqual([])
  })
})

describe('assignableRoles', () => {
  it('keeps adults and children in their own roles', () => {
    expect(assignableRoles(as('owner'), adult)).not.toContain('child')
    expect(assignableRoles(as('owner'), child)).toEqual(['child', 'teen'])
  })

  it('never touches the owner, yourself, or admins unless you own the household', () => {
    expect(assignableRoles(as('owner'), { ...adult, role: 'owner' })).toEqual([])
    expect(assignableRoles(as('owner'), { ...adult, isMe: true })).toEqual([])
    expect(assignableRoles(as('admin'), admin)).toEqual([])
    expect(assignableRoles(as('admin'), adult)).not.toContain('admin')
  })

  it('needs manage_members', () => {
    expect(assignableRoles(as('adult'), { ...adult, role: 'guest' })).toEqual([])
  })
})

describe('canRemoveMember', () => {
  it('follows the database rules', () => {
    expect(canRemoveMember(as('admin'), adult)).toBe(true)
    expect(canRemoveMember(as('admin'), admin)).toBe(false)
    expect(canRemoveMember(as('owner'), admin)).toBe(true)
    expect(canRemoveMember(as('adult'), { ...adult, role: 'guest' })).toBe(false)
    // Children are removed by deleting their account, not their membership.
    expect(canRemoveMember(as('owner'), child)).toBe(false)
  })
})

describe('inviteTokenSchema', () => {
  it('accepts exactly 64 lowercase hex characters', () => {
    expect(inviteTokenSchema.safeParse('a'.repeat(64)).success).toBe(true)
    expect(inviteTokenSchema.safeParse('A'.repeat(64)).success).toBe(false)
    expect(inviteTokenSchema.safeParse('a'.repeat(63)).success).toBe(false)
  })
})
