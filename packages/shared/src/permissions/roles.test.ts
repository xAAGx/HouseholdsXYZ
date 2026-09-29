import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RESERVED_HOUSEHOLD_SLUGS } from '../households/slug'
import {
  HOUSEHOLD_PERMISSIONS,
  HOUSEHOLD_ROLES,
  ROLE_DEFAULT_PERMISSIONS,
  resolveEffectivePermissions,
} from './roles'

describe('resolveEffectivePermissions', () => {
  it('gives owners everything and inactive members nothing', () => {
    expect(resolveEffectivePermissions({ role: 'owner', status: 'active' }).size).toBe(
      HOUSEHOLD_PERMISSIONS.length,
    )
    expect(resolveEffectivePermissions({ role: 'admin', status: 'invited' }).size).toBe(0)
    expect(resolveEffectivePermissions({ role: 'admin', status: 'suspended' }).size).toBe(0)
  })

  it('applies grants, and revocations win over grants and defaults', () => {
    const perms = resolveEffectivePermissions({
      role: 'adult',
      status: 'active',
      grantedPermissions: ['publish_public'],
      revokedPermissions: ['view_expenses', 'publish_public'],
    })
    expect(perms.has('publish_public')).toBe(false)
    expect(perms.has('view_expenses')).toBe(false)
    expect(perms.has('manage_calendar')).toBe(true)
  })

  it('never gives children or guests management permissions by default', () => {
    for (const role of ['child', 'teen', 'guest'] as const) {
      const perms = resolveEffectivePermissions({ role, status: 'active' })
      for (const p of [
        'manage_members',
        'manage_children',
        'publish_public',
        'view_documents',
      ] as const) {
        expect(perms.has(p)).toBe(false)
      }
    }
  })
})

// ── Drift guard: TS mirrors must match what the database enforces ────────────

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../supabase/migrations')

/** Returns the body of the most recent `-- @<marker>:begin … :end` block across all migrations. */
function latestMarkedBlock(marker: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  let latest: string | undefined
  const pattern = new RegExp(`-- @${marker}:begin([\\s\\S]*?)-- @${marker}:end`)
  for (const file of files) {
    const match = pattern.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    if (match) latest = match[1]
  }
  if (latest === undefined) throw new Error(`No @${marker} block found in migrations`)
  return latest
}

describe('database sync', () => {
  it('role defaults match household_role_permissions', () => {
    const sqlPairs = [...latestMarkedBlock('role-permissions').matchAll(/\('(\w+)',\s*'(\w+)'\)/g)]
      .map(([, role, permission]) => `${role}:${permission}`)
      .sort()

    const tsPairs = HOUSEHOLD_ROLES.filter((role) => role !== 'owner')
      .flatMap((role) => ROLE_DEFAULT_PERMISSIONS[role].map((p) => `${role}:${p}`))
      .sort()

    expect(tsPairs).toEqual(sqlPairs)
  })

  it('reserved slugs match private.reserved_slugs', () => {
    const sqlSlugs = [...latestMarkedBlock('reserved-slugs').matchAll(/\('([a-z0-9-]+)'\)/g)]
      .map(([, slug]) => slug)
      .sort()
    expect([...RESERVED_HOUSEHOLD_SLUGS].sort()).toEqual(sqlSlugs)
  })
})
