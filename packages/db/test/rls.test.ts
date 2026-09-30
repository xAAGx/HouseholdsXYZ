import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  anon,
  as,
  createAuthUser,
  createTestDatabase,
  insertAuthUser,
  PLACES,
  service,
  user,
  VALID_SIGN_UP,
} from './supabase-shim'

// Security regression suite for the core RLS model. Each test states a rule
// from SECURITY.md and tries to break it as a real client role would.

let db: PGlite
const ids = { owner: '', adult: '', child: '', stranger: '', household: '' }

async function pgErrorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
    return undefined
  } catch (error) {
    return (error as { code?: string }).code
  }
}

function yearsAgo(years: number, days = 0): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  db = await createTestDatabase()
  ids.owner = await createAuthUser(db, { first_name: 'Pat', last_name: 'Smith' })
  ids.adult = await createAuthUser(db, { first_name: 'Sam', last_name: 'Smith' })
  ids.child = await createAuthUser(db, { first_name: 'Kid', last_name: 'Smith' })
  ids.stranger = await createAuthUser(db)
  // Child accounts will come from a parent-managed flow; simulate one here.
  await db.query(
    `update public.profiles set account_type = 'child', city_id = null where id = $1`,
    [ids.child],
  )

  ids.household = await as(db, user(ids.owner), async () => {
    const { rows } = await db.query<{ id: string }>(
      `select public.create_household('The Smiths', 'TheSmithsHouse', $1) as id`,
      [PLACES.sanFrancisco],
    )
    return rows[0]!.id
  })
  await db.query(
    `insert into public.household_members (household_id, profile_id, role, status, joined_at)
     values ($1, $2, 'adult', 'active', now()), ($1, $3, 'child', 'active', now())`,
    [ids.household, ids.adult, ids.child],
  )
}, 60_000)

describe('sign-up', () => {
  it('creates the profile from the sign-up details', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      'select display_name, first_name, last_name, city_id from public.profiles where id = $1',
      [ids.owner],
    )
    expect(rows[0]).toEqual({
      display_name: 'Pat Smith',
      first_name: 'Pat',
      last_name: 'Smith',
      city_id: PLACES.sanFrancisco,
    })
  })

  it('removes date of birth, phone and city from auth metadata (they ride in tokens)', async () => {
    const { rows } = await db.query<{ meta: Record<string, unknown> }>(
      'select raw_user_meta_data as meta from auth.users where id = $1',
      [ids.owner],
    )
    expect(rows[0]?.meta).toEqual({ first_name: 'Pat', last_name: 'Smith' })
  })

  it.each([
    ['under 18', { date_of_birth: yearsAgo(18, 1) }, '22023'],
    ['a missing phone', { phone: '' }, '22023'],
    ['a malformed date of birth', { date_of_birth: 'not-a-date' }, '22023'],
    ['an unknown city', { city_id: 1 }, '22023'],
    ['a malformed phone', { phone: '0415 555 0100' }, '23514'],
    ['a first name over 50 characters', { first_name: 'x'.repeat(51) }, '23514'],
  ])('rejects someone with %s', async (_label, override, expected) => {
    const code = await pgErrorCode(() => createAuthUser(db, override))
    expect(code).toBe(expected)
  })

  it('accepts someone who turned 18 today', async () => {
    const code = await pgErrorCode(() => createAuthUser(db, { date_of_birth: yearsAgo(18) }))
    expect(code).toBeUndefined()
  })

  it('rejects sign-ups without any details (e.g. admin-created users)', async () => {
    expect(await pgErrorCode(() => insertAuthUser(db, {}))).toBe('22023')
  })
})

describe('profiles', () => {
  it('are hidden from people who share no household', async () => {
    const { rows } = await as(db, user(ids.stranger), () =>
      db.query('select id from public.profiles where id = $1', [ids.owner]),
    )
    expect(rows).toHaveLength(0)
  })

  it('are visible to household co-members', async () => {
    const { rows } = await as(db, user(ids.adult), () =>
      db.query('select id from public.profiles where id = $1', [ids.owner]),
    )
    expect(rows).toHaveLength(1)
  })

  it('cannot have account_type changed by the user', async () => {
    const code = await as(db, user(ids.child), () =>
      pgErrorCode(() =>
        db.query(`update public.profiles set account_type = 'standard' where id = $1`, [ids.child]),
      ),
    )
    expect(code).toBe('42501')
  })

  it("can't be edited by children themselves (parents manage them)", async () => {
    const result = await as(db, user(ids.child), () =>
      db.query(`update public.profiles set display_name = 'x' where id = $1`, [ids.child]),
    )
    expect(result.affectedRows).toBe(0)
  })

  it('never make a child discoverable or give them a location, whoever writes', async () => {
    // As the database owner, past RLS: the table constraints still hold.
    expect(
      await pgErrorCode(() =>
        db.query('update public.profiles set is_discoverable = true where id = $1', [ids.child]),
      ),
    ).toBe('23514')
    expect(
      await pgErrorCode(() =>
        db.query('update public.profiles set city_id = $1 where id = $2', [
          PLACES.sanFrancisco,
          ids.child,
        ]),
      ),
    ).toBe('23514')
  })

  it("cannot edit someone else's profile", async () => {
    const result = await as(db, user(ids.adult), () =>
      db.query(`update public.profiles set display_name = 'x' where id = $1`, [ids.owner]),
    )
    expect(result.affectedRows).toBe(0)
  })
})

describe('account details (date of birth, phone)', () => {
  it('are readable by the account owner', async () => {
    const { rows } = await as(db, user(ids.owner), () =>
      db.query<{ phone: string }>('select phone from public.account_details'),
    )
    expect(rows).toEqual([{ phone: VALID_SIGN_UP.phone }])
  })

  it('are hidden even from household co-members', async () => {
    for (const actor of [user(ids.adult), user(ids.stranger)]) {
      const { rows } = await as(db, actor, () =>
        db.query('select * from public.account_details where profile_id = $1', [ids.owner]),
      )
      expect(rows).toHaveLength(0)
    }
    const code = await as(db, anon, () =>
      pgErrorCode(() => db.query('select * from public.account_details')),
    )
    expect(code).toBe('42501')
  })

  it('let the owner change their phone, which clears its verification', async () => {
    await db.query(
      `update public.account_details set phone_verified_at = now() where profile_id = $1`,
      [ids.owner],
    )
    await as(db, user(ids.owner), () =>
      db.query(`update public.account_details set phone = '+14155550199' where profile_id = $1`, [
        ids.owner,
      ]),
    )
    const { rows } = await db.query<{ verified: unknown }>(
      'select phone_verified_at as verified from public.account_details where profile_id = $1',
      [ids.owner],
    )
    expect(rows[0]?.verified).toBeNull()
  })

  it("don't let the owner change their date of birth (keeps the 18+ rule)", async () => {
    const code = await as(db, user(ids.owner), () =>
      pgErrorCode(() =>
        db.query(
          `update public.account_details set date_of_birth = '2015-01-01' where profile_id = $1`,
          [ids.owner],
        ),
      ),
    )
    expect(code).toBe('42501')
  })
})

describe('places', () => {
  it('are readable by anyone, including before sign-in', async () => {
    const { rows } = await as(db, anon, () =>
      db.query('select slug from public.geo_cities where id = $1', [PLACES.cairo]),
    )
    expect(rows).toEqual([{ slug: 'cairo' }])
  })

  it('cannot be changed by users', async () => {
    for (const actor of [anon, user(ids.owner)]) {
      const code = await as(db, actor, () =>
        pgErrorCode(() =>
          db.query(`update public.geo_cities set name = 'x' where id = $1`, [PLACES.cairo]),
        ),
      )
      expect(code).toBe('42501')
    }
  })
})

describe('households', () => {
  it('are private by default', async () => {
    for (const actor of [anon, user(ids.stranger)]) {
      const { rows } = await as(db, actor, () => db.query('select id from public.households'))
      expect(rows).toHaveLength(0)
    }
  })

  it('cannot be inserted directly, only through create_household()', async () => {
    const code = await as(db, user(ids.stranger), () =>
      pgErrorCode(() =>
        db.query(`insert into public.households (name, slug) values ('x', 'sneakyhouse')`),
      ),
    )
    expect(code).toBe('42501')
  })

  it.each([
    ['taken in the same city (case-insensitive)', 'thesmithshouse', '23505'],
    ['reserved', 'Admin', '23514'],
    ['malformed', 'a--b', '23514'],
  ])('reject names that are %s', async (_label, slug, expected) => {
    const code = await as(db, user(ids.stranger), () =>
      pgErrorCode(() =>
        db.query('select public.create_household($1, $2, $3)', ['X', slug, PLACES.sanFrancisco]),
      ),
    )
    expect(code).toBe(expected)
  })

  it('allow the same name in a different city', async () => {
    const code = await as(db, user(ids.stranger), () =>
      pgErrorCode(() =>
        db.query('select public.create_household($1, $2, $3)', [
          'Other Smiths',
          'TheSmithsHouse',
          PLACES.newYorkCity,
        ]),
      ),
    )
    expect(code).toBeUndefined()
  })

  it('need a real city', async () => {
    const code = await as(db, user(ids.stranger), () =>
      pgErrorCode(() => db.query(`select public.create_household('X', 'nowherehouse', 1)`)),
    )
    expect(code).toBe('23514')
  })

  it('cannot be created by child accounts or anonymous visitors', async () => {
    for (const actor of [user(ids.child), anon]) {
      const code = await as(db, actor, () =>
        pgErrorCode(() =>
          db.query(`select public.create_household('X', 'otherhouse', $1)`, [PLACES.cairo]),
        ),
      )
      expect(code).toBe('42501')
    }
  })

  it('need manage_household to edit and publish_public to go public', async () => {
    const renamed = await as(db, user(ids.adult), () =>
      db.query(`update public.households set name = 'Hijacked' where id = $1`, [ids.household]),
    )
    expect(renamed.affectedRows).toBe(0)

    await db.query(
      `update public.household_members set granted_permissions = '{manage_household}' where profile_id = $1`,
      [ids.adult],
    )
    const allowed = await as(db, user(ids.adult), () =>
      db.query(`update public.households set name = 'Smith Family' where id = $1`, [ids.household]),
    )
    expect(allowed.affectedRows).toBe(1)

    const code = await as(db, user(ids.adult), () =>
      pgErrorCode(() =>
        db.query(`update public.households set visibility = 'public' where id = $1`, [
          ids.household,
        ]),
      ),
    )
    expect(code).toBe('42501')
  })

  it('once public, expose the profile but never the members', async () => {
    await as(db, user(ids.owner), () =>
      db.query(`update public.households set visibility = 'public' where id = $1`, [ids.household]),
    )
    const visible = await as(db, anon, () => db.query('select id from public.households'))
    expect(visible.rows).toHaveLength(1)

    const membersCode = await as(db, anon, () =>
      pgErrorCode(() => db.query('select * from public.household_members')),
    )
    expect(membersCode).toBe('42501')

    const profiles = await as(db, user(ids.stranger), () =>
      db.query('select id from public.profiles where id <> $1', [ids.stranger]),
    )
    expect(profiles.rows).toHaveLength(0)

    await as(db, user(ids.owner), () =>
      db.query(`update public.households set visibility = 'private' where id = $1`, [
        ids.household,
      ]),
    )
  })

  it('can only be deleted by the owner', async () => {
    const result = await as(db, user(ids.adult), () =>
      db.query('delete from public.households where id = $1', [ids.household]),
    )
    expect(result.affectedRows).toBe(0)
  })
})

describe('household addresses', () => {
  const resolve = (actor: Parameters<typeof as>[1], path: [string, string, string, string]) =>
    as(db, actor, () =>
      db.query<{ household_id: string; is_current: boolean }>(
        'select * from public.resolve_household_address($1, $2, $3, $4)',
        path,
      ),
    )

  const sfAddress: [string, string, string, string] = [
    'us',
    'california',
    'san-francisco',
    'thesmithshouse',
  ]

  it('resolve for members, case-insensitively', async () => {
    const { rows } = await resolve(user(ids.owner), [
      'US',
      'California',
      'San-Francisco',
      'TheSmithsHouse',
    ])
    expect(rows).toEqual([{ household_id: ids.household, is_current: true }])
  })

  it('look exactly like a missing address to outsiders when private', async () => {
    for (const actor of [anon, user(ids.stranger)]) {
      expect((await resolve(actor, sfAddress)).rows).toEqual([])
      expect(
        (await resolve(actor, ['us', 'california', 'san-francisco', 'nobodyhere'])).rows,
      ).toEqual([])
    }
  })

  it('redirect after a move, but only for people who can see the household', async () => {
    const cabin = await as(db, user(ids.owner), async () => {
      const { rows } = await db.query<{ id: string }>(
        `select public.create_household('Lake cabin', 'LakeCabin', $1) as id`,
        [PLACES.sanFrancisco],
      )
      return rows[0]!.id
    })
    await as(db, user(ids.owner), () =>
      db.query('update public.households set city_id = $1 where id = $2', [
        PLACES.newYorkCity,
        cabin,
      ]),
    )

    const oldAddress: [string, string, string, string] = [
      'us',
      'california',
      'san-francisco',
      'lakecabin',
    ]
    const newAddress: [string, string, string, string] = [
      'us',
      'new-york',
      'new-york-city',
      'lakecabin',
    ]

    expect((await resolve(user(ids.owner), oldAddress)).rows).toEqual([
      { household_id: cabin, is_current: false },
    ])
    expect((await resolve(user(ids.owner), newAddress)).rows).toEqual([
      { household_id: cabin, is_current: true },
    ])
    for (const actor of [anon, user(ids.stranger)]) {
      expect((await resolve(actor, oldAddress)).rows).toEqual([])
    }
  })

  it('prefer a household living at an address over an old redirect to it', async () => {
    // LakeCabin moved out of San Francisco; someone else can now use the name there.
    const newcomer = await as(db, user(ids.stranger), async () => {
      const { rows } = await db.query<{ id: string }>(
        `select public.create_household('Lake cabin', 'LakeCabin', $1) as id`,
        [PLACES.sanFrancisco],
      )
      return rows[0]!.id
    })
    const { rows } = await resolve(user(ids.stranger), [
      'us',
      'california',
      'san-francisco',
      'lakecabin',
    ])
    expect(rows).toEqual([{ household_id: newcomer, is_current: true }])
  })
})

describe('memberships', () => {
  it('cannot be self-inserted', async () => {
    const code = await as(db, user(ids.stranger), () =>
      pgErrorCode(() =>
        db.query(
          `insert into public.household_members (household_id, profile_id, role, status, joined_at)
           values ($1, $2, 'owner', 'active', now())`,
          [ids.household, ids.stranger],
        ),
      ),
    )
    expect(code).toBe('42501')
  })

  it('are invisible to outsiders', async () => {
    const { rows } = await as(db, user(ids.stranger), () =>
      db.query('select * from public.household_members where household_id = $1', [ids.household]),
    )
    expect(rows).toHaveLength(0)
  })

  it('resolve effective permissions from role + grants', async () => {
    const perms = async (id: string) => {
      const { rows } = await as(db, user(id), () =>
        db.query<{ p: string[] }>('select public.my_household_permissions($1)::text[] as p', [
          ids.household,
        ]),
      )
      return rows[0]!.p
    }
    expect(await perms(ids.owner)).toHaveLength(13)
    expect(await perms(ids.child)).toEqual(['create_posts'])
    expect(await perms(ids.stranger)).toEqual([])
  })

  it('protect owners and children from removal', async () => {
    const childLeaves = await as(db, user(ids.child), () =>
      db.query('delete from public.household_members where profile_id = $1', [ids.child]),
    )
    expect(childLeaves.affectedRows).toBe(0)

    const ownerRemoved = await as(db, user(ids.adult), () =>
      db.query('delete from public.household_members where profile_id = $1 and household_id = $2', [
        ids.owner,
        ids.household,
      ]),
    )
    expect(ownerRemoved.affectedRows).toBe(0)

    const ownerLeaves = await as(db, user(ids.owner), () =>
      db.query('delete from public.household_members where profile_id = $1 and household_id = $2', [
        ids.owner,
        ids.household,
      ]),
    )
    expect(ownerLeaves.affectedRows).toBe(0)
  })
})

// ── Roles, invites and child accounts ───────────────────────────────────────
// A separate household per block, so earlier tests' changes don't leak in.

async function newAdult(first: string): Promise<string> {
  return createAuthUser(db, { first_name: first, last_name: 'Jones' })
}

async function newHousehold(ownerId: string, slug: string): Promise<string> {
  return as(db, user(ownerId), async () => {
    const { rows } = await db.query<{ id: string }>(
      `select public.create_household('The Joneses', $1, $2) as id`,
      [slug, PLACES.cairo],
    )
    return rows[0]!.id
  })
}

async function invite(actorId: string, householdId: string, role: string) {
  return as(db, user(actorId), async () => {
    const { rows } = await db.query<{ invite_id: string; invite_token: string }>(
      'select * from public.create_household_invite($1, $2)',
      [householdId, role],
    )
    return rows[0]!
  })
}

async function accept(actorId: string, token: string) {
  return as(db, user(actorId), () =>
    db.query<{ id: string }>('select public.accept_household_invite($1) as id', [token]),
  )
}

async function roleOf(householdId: string, profileId: string): Promise<string | undefined> {
  const { rows } = await db.query<{ role: string }>(
    'select role from public.household_members where household_id = $1 and profile_id = $2',
    [householdId, profileId],
  )
  return rows[0]?.role
}

/** Creates a child login the way the API does: set-up secret, then Supabase Auth. */
async function newChild(parentId: string, householdId: string, name = 'Leo'): Promise<string> {
  const secret = await as(db, service, async () => {
    const { rows } = await db.query<{ secret: string }>(
      'select public.begin_child_account($1, $2, $3) as secret',
      [parentId, householdId, name],
    )
    return rows[0]!.secret
  })
  return insertAuthUser(db, { child_setup: secret })
}

describe('invite links', () => {
  const people = { owner: '', adult: '', invitee: '', latecomer: '', household: '' }

  beforeAll(async () => {
    people.owner = await newAdult('Olga')
    people.adult = await newAdult('Adam')
    people.invitee = await newAdult('Ines')
    people.latecomer = await newAdult('Lars')
    people.household = await newHousehold(people.owner, 'InviteHouse')
    const { invite_token } = await invite(people.owner, people.household, 'adult')
    await accept(people.adult, invite_token)
  })

  it('store only a hash of the token', async () => {
    const { invite_id, invite_token } = await invite(people.owner, people.household, 'guest')
    expect(invite_token).toMatch(/^[0-9a-f]{64}$/)
    const { rows } = await db.query<{ token_hash: string }>(
      'select token_hash from public.household_invites where id = $1',
      [invite_id],
    )
    expect(rows[0]?.token_hash).not.toBe(invite_token)
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never expose token hashes, even to inviters', async () => {
    const code = await as(db, user(people.owner), () =>
      pgErrorCode(() => db.query('select token_hash from public.household_invites')),
    )
    expect(code).toBe('42501')
  })

  it('make the invitee a member with the invited role, once', async () => {
    const { invite_token } = await invite(people.adult, people.household, 'caregiver')
    await accept(people.invitee, invite_token)
    expect(await roleOf(people.household, people.invitee)).toBe('caregiver')
    expect(await pgErrorCode(() => accept(people.latecomer, invite_token))).toBe('P0002')
    expect(await roleOf(people.household, people.latecomer)).toBeUndefined()
  })

  it('stop working when they expire', async () => {
    const { invite_id, invite_token } = await invite(people.owner, people.household, 'guest')
    await db.query(
      `update public.household_invites set expires_at = now() - interval '1 minute' where id = $1`,
      [invite_id],
    )
    expect(await pgErrorCode(() => accept(people.latecomer, invite_token))).toBe('P0002')
  })

  it('let only the owner invite admins', async () => {
    expect(await pgErrorCode(() => invite(people.adult, people.household, 'admin'))).toBe('42501')
    expect(await pgErrorCode(() => invite(people.owner, people.household, 'admin'))).toBeUndefined()
  })

  it('are for adults only: no child or teen invites', async () => {
    for (const role of ['child', 'teen', 'owner']) {
      expect(await pgErrorCode(() => invite(people.owner, people.household, role))).toBe('22023')
    }
  })

  it("can't be created by outsiders or members without invite_members", async () => {
    expect(await pgErrorCode(() => invite(people.latecomer, people.household, 'adult'))).toBe(
      '42501',
    )
    // Caregivers can't invite by default.
    expect(await pgErrorCode(() => invite(people.invitee, people.household, 'guest'))).toBe('42501')
  })

  it('show a preview to signed-in adults only while open', async () => {
    const { invite_token } = await invite(people.owner, people.household, 'adult')
    const preview = await as(db, user(people.latecomer), () =>
      db.query<{ household_name: string; invited_by: string }>(
        'select * from public.get_household_invite($1)',
        [invite_token],
      ),
    )
    expect(preview.rows[0]).toMatchObject({
      household_name: 'The Joneses',
      invited_by: 'Olga Jones',
    })

    const anonCode = await as(db, anon, () =>
      pgErrorCode(() => db.query('select * from public.get_household_invite($1)', [invite_token])),
    )
    expect(anonCode).toBe('42501')

    const wrong = await as(db, user(people.latecomer), () =>
      db.query('select * from public.get_household_invite($1)', ['0'.repeat(64)]),
    )
    expect(wrong.rows).toEqual([])
  })

  it('are listed and revoked by inviters, not by others', async () => {
    const { invite_id } = await invite(people.owner, people.household, 'guest')
    const seen = await as(db, user(people.invitee), () =>
      db.query('select id from public.household_invites where id = $1', [invite_id]),
    )
    expect(seen.rows).toHaveLength(0)

    const revokedByCaregiver = await as(db, user(people.invitee), () =>
      db.query('delete from public.household_invites where id = $1', [invite_id]),
    )
    expect(revokedByCaregiver.affectedRows).toBe(0)

    const revoked = await as(db, user(people.adult), () =>
      db.query('delete from public.household_invites where id = $1', [invite_id]),
    )
    expect(revoked.affectedRows).toBe(1)
  })
})

describe('member roles', () => {
  const people = { owner: '', admin: '', adult: '', household: '' }

  beforeAll(async () => {
    people.owner = await newAdult('Rosa')
    people.admin = await newAdult('Arto')
    people.adult = await newAdult('Aida')
    people.household = await newHousehold(people.owner, 'RoleHouse')
    await accept(people.admin, (await invite(people.owner, people.household, 'admin')).invite_token)
    await accept(people.adult, (await invite(people.owner, people.household, 'adult')).invite_token)
  })

  const setRole = (actorId: string, profileId: string, role: string) =>
    as(db, user(actorId), () =>
      db.query('select public.set_household_member_role($1, $2, $3)', [
        people.household,
        profileId,
        role,
      ]),
    )

  it('are changed by people with manage_members', async () => {
    await setRole(people.admin, people.adult, 'caregiver')
    expect(await roleOf(people.household, people.adult)).toBe('caregiver')
    await setRole(people.admin, people.adult, 'adult')
  })

  it('need the owner to make or unmake admins', async () => {
    expect(await pgErrorCode(() => setRole(people.admin, people.adult, 'admin'))).toBe('42501')
    await setRole(people.owner, people.adult, 'admin')
    expect(await pgErrorCode(() => setRole(people.admin, people.adult, 'guest'))).toBe('42501')
    await setRole(people.owner, people.adult, 'adult')
  })

  it("never touch the owner, your own role, or anyone's without permission", async () => {
    expect(await pgErrorCode(() => setRole(people.admin, people.owner, 'adult'))).toBe('42501')
    expect(await pgErrorCode(() => setRole(people.admin, people.admin, 'owner'))).toBe('42501')
    expect(await pgErrorCode(() => setRole(people.adult, people.admin, 'guest'))).toBe('42501')
  })

  it('keep adults out of child roles and children out of adult roles', async () => {
    expect(await pgErrorCode(() => setRole(people.owner, people.adult, 'child'))).toBe('23514')
    const child = await newChild(people.owner, people.household)
    expect(await pgErrorCode(() => setRole(people.owner, child, 'adult'))).toBe('23514')
    await setRole(people.owner, child, 'teen')
    expect(await roleOf(people.household, child)).toBe('teen')
  })
})

describe('child accounts', () => {
  const people = { parent: '', adult: '', stranger: '', household: '' }

  beforeAll(async () => {
    people.parent = await newAdult('Petra')
    people.adult = await newAdult('Anton')
    people.stranger = await newAdult('Sven')
    people.household = await newHousehold(people.parent, 'ChildHouse')
    await accept(
      people.adult,
      (await invite(people.parent, people.household, 'adult')).invite_token,
    )
  })

  it('are created from a one-time set-up secret, as members with the child role', async () => {
    const child = await newChild(people.parent, people.household, 'Mia')
    const { rows } = await db.query<Record<string, unknown>>(
      `select p.display_name, p.account_type, p.city_id, m.role, u.raw_user_meta_data as meta
       from public.profiles p
       join public.household_members m on m.profile_id = p.id
       join auth.users u on u.id = p.id
       where p.id = $1`,
      [child],
    )
    expect(rows[0]).toEqual({
      display_name: 'Mia',
      account_type: 'child',
      city_id: null,
      role: 'child',
      meta: {},
    })
  })

  it('refuse reused, forged or expired set-up secrets', async () => {
    const secret = await as(db, service, async () => {
      const { rows } = await db.query<{ secret: string }>(
        'select public.begin_child_account($1, $2, $3) as secret',
        [people.parent, people.household, 'Noa'],
      )
      return rows[0]!.secret
    })
    await insertAuthUser(db, { child_setup: secret })
    expect(await pgErrorCode(() => insertAuthUser(db, { child_setup: secret }))).toBe('22023')
    expect(await pgErrorCode(() => insertAuthUser(db, { child_setup: 'f'.repeat(64) }))).toBe(
      '22023',
    )
  })

  it('can only be set up for parents with manage_children', async () => {
    for (const parent of [people.adult, people.stranger]) {
      const code = await as(db, service, () =>
        pgErrorCode(() =>
          db.query('select public.begin_child_account($1, $2, $3)', [
            parent,
            people.household,
            'Eve',
          ]),
        ),
      )
      expect(code).toBe('42501')
    }
  })

  it('cannot be set up by signed-in users directly, only by the API', async () => {
    const code = await as(db, user(people.parent), () =>
      pgErrorCode(() =>
        db.query('select public.begin_child_account($1, $2, $3)', [
          people.parent,
          people.household,
          'Eve',
        ]),
      ),
    )
    expect(code).toBe('42501')
  })

  it("can't create households or accept invites", async () => {
    const child = await newChild(people.parent, people.household)
    const createCode = await as(db, user(child), () =>
      pgErrorCode(() =>
        db.query(`select public.create_household('Kid house', 'KidHouse', $1)`, [PLACES.cairo]),
      ),
    )
    expect(createCode).toBe('42501')
    const { invite_token } = await invite(people.parent, people.household, 'guest')
    expect(await pgErrorCode(() => accept(child, invite_token))).toBe('42501')
  })
})

describe('child sign-in codes', () => {
  const people = { parent: '', adult: '', child: '', household: '' }

  beforeAll(async () => {
    people.parent = await newAdult('Paula')
    people.adult = await newAdult('Arne')
    people.household = await newHousehold(people.parent, 'CodeHouse')
    await accept(
      people.adult,
      (await invite(people.parent, people.household, 'adult')).invite_token,
    )
    people.child = await newChild(people.parent, people.household, 'Ava')
  })

  const createCode = (actorId: string, childId: string) =>
    as(db, user(actorId), async () => {
      const { rows } = await db.query<{ sign_in_code: string }>(
        'select * from public.create_child_sign_in_code($1, $2)',
        [people.household, childId],
      )
      return rows[0]!.sign_in_code
    })

  const redeem = (code: string) =>
    as(db, service, async () => {
      const { rows } = await db.query<{ child: string | null }>(
        'select public.redeem_child_sign_in_code($1) as child',
        [code],
      )
      return rows[0]!.child
    })

  it('are 8 characters from an alphabet without look-alikes', async () => {
    const code = await createCode(people.parent, people.child)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('unlock the child once', async () => {
    const code = await createCode(people.parent, people.child)
    expect(await redeem(code)).toBe(people.child)
    expect(await redeem(code)).toBeNull()
  })

  it('replace any earlier code, and expire', async () => {
    const first = await createCode(people.parent, people.child)
    const second = await createCode(people.parent, people.child)
    expect(await redeem(first)).toBeNull()
    await db.query(
      `update private.child_sign_in_codes set expires_at = now() - interval '1 second'`,
    )
    expect(await redeem(second)).toBeNull()
  })

  it('are only made by parents with manage_children, and only for child accounts', async () => {
    expect(await pgErrorCode(() => createCode(people.adult, people.child))).toBe('42501')
    expect(await pgErrorCode(() => createCode(people.parent, people.adult))).toBe('42501')
  })

  it('can only be redeemed by the API, never by signed-in users or visitors', async () => {
    const code = await createCode(people.parent, people.child)
    for (const actor of [anon, user(people.adult)]) {
      const err = await as(db, actor, () =>
        pgErrorCode(() => db.query('select public.redeem_child_sign_in_code($1)', [code])),
      )
      expect(err).toBe('42501')
    }
  })

  it("aren't readable by anyone but the database", async () => {
    const err = await as(db, user(people.parent), () =>
      pgErrorCode(() => db.query('select * from private.child_sign_in_codes')),
    )
    expect(err).toBe('42501')
  })
})

describe('lists', () => {
  const p = { owner: '', adult: '', guest: '', child: '', leaver: '', stranger: '', household: '' }

  beforeAll(async () => {
    p.owner = await newAdult('Lina')
    p.adult = await newAdult('Omar')
    p.guest = await newAdult('Gus')
    p.leaver = await newAdult('Lea')
    p.stranger = await newAdult('Sara')
    p.household = await newHousehold(p.owner, 'ListHouse')
    await accept(p.adult, (await invite(p.owner, p.household, 'adult')).invite_token)
    await accept(p.guest, (await invite(p.owner, p.household, 'guest')).invite_token)
    await accept(p.leaver, (await invite(p.owner, p.household, 'adult')).invite_token)
    p.child = await newChild(p.owner, p.household, 'Tia')
  })

  const createList = (actorId: string, title: string, visibility = 'household') =>
    as(db, user(actorId), async () => {
      const { rows } = await db.query<{ id: string }>(
        'insert into public.lists (household_id, title, visibility) values ($1, $2, $3) returning id',
        [p.household, title, visibility],
      )
      return rows[0]!.id
    })

  const addItem = (actorId: string, listId: string, text: string, assignedTo?: string) =>
    as(db, user(actorId), async () => {
      const { rows } = await db.query<{ id: string }>(
        'insert into public.list_items (list_id, text, assigned_to) values ($1, $2, $3) returning id',
        [listId, text, assignedTo ?? null],
      )
      return rows[0]!.id
    })

  const sees = async (actorId: string, listId: string) => {
    const { rows } = await as(db, user(actorId), () =>
      db.query('select id from public.lists where id = $1', [listId]),
    )
    return rows.length === 1
  }

  it('household lists are visible to every member and nobody else', async () => {
    const list = await createList(p.adult, 'Groceries')
    for (const member of [p.owner, p.adult, p.guest, p.child]) {
      expect(await sees(member, list)).toBe(true)
    }
    expect(await sees(p.stranger, list)).toBe(false)
    const anonCode = await as(db, anon, () =>
      pgErrorCode(() => db.query('select id from public.lists')),
    )
    expect(anonCode).toBe('42501')
  })

  it("private lists are the creator's alone, even a child's from their parents", async () => {
    const list = await createList(p.child, 'Birthday wishes', 'private')
    await addItem(p.child, list, 'A red bike')
    expect(await sees(p.child, list)).toBe(true)
    expect(await sees(p.owner, list)).toBe(false)
    const items = await as(db, user(p.owner), () =>
      db.query('select id from public.list_items where list_id = $1', [list]),
    )
    expect(items.rows).toEqual([])
  })

  it('selected-member lists reach only the people the creator chooses', async () => {
    const list = await createList(p.owner, 'Gift ideas for Tia', 'selected_members')
    await as(db, user(p.owner), () =>
      db.query('select public.set_list_members($1, $2::uuid[])', [list, [p.adult]]),
    )
    expect(await sees(p.adult, list)).toBe(true)
    expect(await sees(p.guest, list)).toBe(false)
    expect(await sees(p.child, list)).toBe(false)

    const byOther = await as(db, user(p.adult), () =>
      pgErrorCode(() =>
        db.query('select public.set_list_members($1, $2::uuid[])', [list, [p.guest]]),
      ),
    )
    expect(byOther).toBe('42501')
    const outsider = await as(db, user(p.owner), () =>
      pgErrorCode(() =>
        db.query('select public.set_list_members($1, $2::uuid[])', [list, [p.stranger]]),
      ),
    )
    expect(outsider).toBe('22023')
  })

  it("ignore a forged household on new items: they always belong to their list's", async () => {
    const list = await createList(p.adult, 'Forgery check')
    const other = await newHousehold(p.stranger, 'ElsewhereHouse')
    const item = await as(db, user(p.adult), async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.list_items (list_id, household_id, position, text)
         values ($1, $2, 999, 'Forged') returning id`,
        [list, other],
      )
      return rows[0]!.id
    })
    const { rows } = await db.query<{ household_id: string; position: number }>(
      'select household_id, position from public.list_items where id = $1',
      [item],
    )
    expect(rows[0]).toEqual({ household_id: p.household, position: 1 })
  })

  it('let guests read household lists but not change them', async () => {
    const list = await createList(p.adult, 'Chores board')
    expect(await pgErrorCode(() => addItem(p.guest, list, 'Nope'))).toBe('42501')
    expect(await pgErrorCode(() => createList(p.guest, 'Guest list'))).toBe('42501')
  })

  it('let children tick items off, and record who did it', async () => {
    const list = await createList(p.adult, 'Weekend')
    const item = await addItem(p.adult, list, 'Milk')
    await as(db, user(p.child), () =>
      db.query('update public.list_items set done_at = now() where id = $1', [item]),
    )
    const { rows } = await db.query<{ done_by: string }>(
      'select done_by from public.list_items where id = $1',
      [item],
    )
    expect(rows[0]?.done_by).toBe(p.child)
  })

  it('let only the creator change who sees a list; moderators may rename household lists', async () => {
    const list = await createList(p.adult, 'Holiday packing')
    const renamed = await as(db, user(p.owner), () =>
      db.query(`update public.lists set title = 'Packing for Rome' where id = $1`, [list]),
    )
    expect(renamed.affectedRows).toBe(1)
    const hidden = await as(db, user(p.owner), () =>
      pgErrorCode(() =>
        db.query(`update public.lists set visibility = 'private' where id = $1`, [list]),
      ),
    )
    expect(hidden).toBe('42501')

    await as(db, user(p.adult), () =>
      db.query(`update public.lists set visibility = 'private' where id = $1`, [list]),
    )
    expect(await sees(p.owner, list)).toBe(false)
  })

  it('never reach beyond the household', async () => {
    for (const visibility of ['connections', 'neighborhood', 'public']) {
      expect(await pgErrorCode(() => createList(p.owner, 'Public', visibility))).toBe('23514')
    }
  })

  it('assign items only to people who can see the list', async () => {
    const list = await createList(p.adult, 'My errands', 'private')
    expect(await pgErrorCode(() => addItem(p.adult, list, 'Post office', p.owner))).toBe('22023')
    expect(await pgErrorCode(() => addItem(p.adult, list, 'Bank', p.adult))).toBeUndefined()
  })

  it('are read-only once archived', async () => {
    const list = await createList(p.adult, 'Old list')
    const item = await addItem(p.adult, list, 'Something')
    await as(db, user(p.adult), () =>
      db.query('update public.lists set archived_at = now() where id = $1', [list]),
    )
    expect(await pgErrorCode(() => addItem(p.adult, list, 'More'))).toBe('22023')
    const update = await as(db, user(p.adult), () =>
      pgErrorCode(() =>
        db.query('update public.list_items set done_at = now() where id = $1', [item]),
      ),
    )
    expect(update).toBe('22023')
  })

  it('keep their order when reordered', async () => {
    const list = await createList(p.adult, 'Ordered')
    const a = await addItem(p.adult, list, 'A')
    const b = await addItem(p.adult, list, 'B')
    const c = await addItem(p.adult, list, 'C')
    await as(db, user(p.child), () =>
      db.query('select public.reorder_list_items($1, $2::uuid[])', [list, [c, a, b]]),
    )
    const { rows } = await db.query<{ text: string }>(
      'select text from public.list_items where list_id = $1 order by position',
      [list],
    )
    expect(rows.map((r) => r.text)).toEqual(['C', 'A', 'B'])
  })

  it('go with someone who leaves: private lists deleted, assignments cleared', async () => {
    const privateList = await createList(p.leaver, 'Mine', 'private')
    const shared = await createList(p.adult, 'Shared')
    const item = await addItem(p.adult, shared, 'Task', p.leaver)
    await as(db, user(p.leaver), () =>
      db.query('delete from public.household_members where household_id = $1 and profile_id = $2', [
        p.household,
        p.leaver,
      ]),
    )
    const lists = await db.query('select id from public.lists where id = $1', [privateList])
    expect(lists.rows).toEqual([])
    const { rows } = await db.query<{ assigned_to: string | null }>(
      'select assigned_to from public.list_items where id = $1',
      [item],
    )
    expect(rows[0]?.assigned_to).toBeNull()
  })
})

describe('chores & rewards', () => {
  const p = { parent: '', adult: '', guest: '', child: '', stranger: '', household: '' }
  const today = new Date().toISOString().slice(0, 10)
  const dayOffset = (days: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  beforeAll(async () => {
    p.parent = await newAdult('Pia')
    p.adult = await newAdult('Ari')
    p.guest = await newAdult('Gwen')
    p.stranger = await newAdult('Stan')
    p.household = await newHousehold(p.parent, 'ChoreHouse')
    await accept(p.adult, (await invite(p.parent, p.household, 'adult')).invite_token)
    await accept(p.guest, (await invite(p.parent, p.household, 'guest')).invite_token)
    p.child = await newChild(p.parent, p.household, 'Kai')
  })

  const createChore = (
    actorId: string,
    fields: {
      title?: string
      points?: number
      assignedTo?: string | null
      repeat?: string
      needsApproval?: boolean
    } = {},
  ) =>
    as(db, user(actorId), async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.chores (household_id, title, points, assigned_to, repeat, needs_approval)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [
          p.household,
          fields.title ?? 'Feed the cat',
          fields.points ?? 10,
          fields.assignedTo ?? null,
          fields.repeat ?? 'daily',
          fields.needsApproval ?? true,
        ],
      )
      return rows[0]!.id
    })

  const complete = (actorId: string, choreId: string, day = today) =>
    as(db, user(actorId), async () => {
      const { rows } = await db.query<{ completion_id: string; completion_status: string }>(
        'select * from public.complete_chore($1, $2)',
        [choreId, day],
      )
      return rows[0]!
    })

  const review = (actorId: string, completionId: string, approve: boolean) =>
    as(db, user(actorId), () =>
      db.query('select public.review_chore_completion($1, $2)', [completionId, approve]),
    )

  const balance = async (profileId: string) => {
    const { rows } = await as(db, user(p.parent), () =>
      db.query<{ profile_id: string; balance: string }>(
        'select * from public.household_points($1)',
        [p.household],
      ),
    )
    return Number(rows.find((r) => r.profile_id === profileId)?.balance ?? 0)
  }

  it('are created only by people who manage chores', async () => {
    expect(await pgErrorCode(() => createChore(p.adult))).toBeUndefined()
    expect(await pgErrorCode(() => createChore(p.child))).toBe('42501')
    expect(await pgErrorCode(() => createChore(p.guest))).toBe('42501')
    expect(await pgErrorCode(() => createChore(p.stranger))).toBe('42501')
  })

  it('are hidden from outsiders', async () => {
    await createChore(p.parent, { title: 'Water plants' })
    const { rows } = await as(db, user(p.stranger), () =>
      db.query('select id from public.chores where household_id = $1', [p.household]),
    )
    expect(rows).toEqual([])
  })

  it('earn a child points once a parent approves, and not before', async () => {
    const chore = await createChore(p.parent, { assignedTo: p.child, points: 15 })
    const done = await complete(p.child, chore)
    expect(done.completion_status).toBe('pending')
    expect(await balance(p.child)).toBe(0)
    await review(p.parent, done.completion_id, true)
    expect(await balance(p.child)).toBe(15)
  })

  it('can be done once per period', async () => {
    const chore = await createChore(p.parent, { assignedTo: p.child, points: 1 })
    await complete(p.child, chore)
    expect(await pgErrorCode(() => complete(p.child, chore))).toBe('23505')
  })

  it('can be tried again after being turned down, with no points meanwhile', async () => {
    const chore = await createChore(p.parent, { assignedTo: p.child, points: 5, repeat: 'once' })
    const first = await complete(p.child, chore)
    await review(p.parent, first.completion_id, false)
    const before = await balance(p.child)
    const second = await complete(p.child, chore)
    expect(second.completion_status).toBe('pending')
    expect(await balance(p.child)).toBe(before)
  })

  it("can't be done for someone else, but anyone's chores are open to all", async () => {
    const theirs = await createChore(p.parent, { assignedTo: p.adult })
    expect(await pgErrorCode(() => complete(p.child, theirs))).toBe('42501')
    const anyone = await createChore(p.parent, { assignedTo: null })
    expect(await pgErrorCode(() => complete(p.child, anyone))).toBeUndefined()
  })

  it("reject device dates more than a day from the server's", async () => {
    const chore = await createChore(p.parent, { assignedTo: p.child })
    expect(await pgErrorCode(() => complete(p.child, chore, dayOffset(3)))).toBe('22023')
    expect(await pgErrorCode(() => complete(p.child, chore, dayOffset(1)))).toBeUndefined()
  })

  it("approve managers' own completions straight away", async () => {
    const chore = await createChore(p.parent, { assignedTo: p.adult, points: 7 })
    const before = await balance(p.adult)
    const done = await complete(p.adult, chore)
    expect(done.completion_status).toBe('approved')
    expect(await balance(p.adult)).toBe(before + 7)
  })

  it("can't be approved by children or guests", async () => {
    const chore = await createChore(p.parent, { assignedTo: p.child, points: 3 })
    const done = await complete(p.child, chore)
    for (const actor of [p.child, p.guest]) {
      expect(await pgErrorCode(() => review(actor, done.completion_id, true))).toBe('42501')
    }
  })

  it('undo: the doer while waiting, managers after approval (points go back)', async () => {
    const chore = await createChore(p.parent, { assignedTo: p.child, points: 4 })
    const done = await complete(p.child, chore)
    await review(p.parent, done.completion_id, true)
    const approvedBalance = await balance(p.child)
    const childUndo = await as(db, user(p.child), () =>
      pgErrorCode(() => db.query('select public.undo_chore_completion($1)', [done.completion_id])),
    )
    expect(childUndo).toBe('42501')
    await as(db, user(p.parent), () =>
      db.query('select public.undo_chore_completion($1)', [done.completion_id]),
    )
    expect(await balance(p.child)).toBe(approvedBalance - 4)
  })

  it('points move only through the database functions', async () => {
    const code = await as(db, user(p.parent), () =>
      pgErrorCode(() =>
        db.query(
          `insert into public.points_ledger (household_id, profile_id, delta, reason)
           values ($1, $2, 1000, 'adjustment')`,
          [p.household, p.parent],
        ),
      ),
    )
    expect(code).toBe('42501')
  })

  it('adjustments: managers, with a reason, never for themselves', async () => {
    const adjust = (actorId: string, target: string, delta: number, note: string) =>
      as(db, user(actorId), () =>
        db.query('select public.adjust_points($1, $2, $3, $4)', [p.household, target, delta, note]),
      )
    const before = await balance(p.child)
    await adjust(p.parent, p.child, 20, 'Helped with dinner')
    expect(await balance(p.child)).toBe(before + 20)
    expect(await pgErrorCode(() => adjust(p.parent, p.parent, 50, 'Me'))).toBe('42501')
    expect(await pgErrorCode(() => adjust(p.child, p.guest, 5, 'Gift'))).toBe('42501')
    expect(await pgErrorCode(() => adjust(p.parent, p.child, 5, '  '))).toBe('22023')
  })

  describe('rewards', () => {
    const createReward = (actorId: string, cost: number) =>
      as(db, user(actorId), async () => {
        const { rows } = await db.query<{ id: string }>(
          `insert into public.rewards (household_id, title, cost) values ($1, 'Movie night', $2) returning id`,
          [p.household, cost],
        )
        return rows[0]!.id
      })
    const request = (actorId: string, rewardId: string) =>
      as(db, user(actorId), async () => {
        const { rows } = await db.query<{ id: string }>('select public.request_reward($1) as id', [
          rewardId,
        ])
        return rows[0]!.id
      })

    it('are created by managers only', async () => {
      expect(await pgErrorCode(() => createReward(p.child, 10))).toBe('42501')
      expect(await pgErrorCode(() => createReward(p.adult, 10))).toBeUndefined()
    })

    it('cost points when asked for, refunded if turned down or cancelled', async () => {
      const cheap = await createReward(p.parent, 5)
      const start = await balance(p.child)
      const first = await request(p.child, cheap)
      expect(await balance(p.child)).toBe(start - 5)

      await as(db, user(p.parent), () =>
        db.query('select public.review_reward_redemption($1, false)', [first]),
      )
      expect(await balance(p.child)).toBe(start)

      const second = await request(p.child, cheap)
      await as(db, user(p.child), () =>
        db.query('select public.cancel_reward_redemption($1)', [second]),
      )
      expect(await balance(p.child)).toBe(start)

      const third = await request(p.child, cheap)
      await as(db, user(p.parent), () =>
        db.query('select public.review_reward_redemption($1, true)', [third]),
      )
      expect(await balance(p.child)).toBe(start - 5)
    })

    it("can't be asked for without enough points", async () => {
      const pricey = await createReward(p.parent, 100000)
      expect(await pgErrorCode(() => request(p.child, pricey))).toBe('22023')
    })

    it('are archived, not deleted, once someone asked for them', async () => {
      const reward = await createReward(p.parent, 1)
      await request(p.child, reward)
      const code = await as(db, user(p.parent), () =>
        pgErrorCode(() => db.query('delete from public.rewards where id = $1', [reward])),
      )
      expect(code).toBe('23001') // restrict_violation
    })
  })

  it('periods: weeks start on Monday, months on the 1st, one-offs never repeat', async () => {
    const period = async (repeat: string, day: string) => {
      const { rows } = await db.query<{ start: string }>(
        `select private.chore_period_start($1, $2::date, '2026-01-15')::text as start`,
        [repeat, day],
      )
      return rows[0]!.start
    }
    expect(await period('daily', '2026-10-01')).toBe('2026-10-01')
    expect(await period('weekly', '2026-10-01')).toBe('2026-09-28')
    expect(await period('weekly', '2026-10-04')).toBe('2026-09-28')
    expect(await period('weekly', '2026-10-05')).toBe('2026-10-05')
    expect(await period('monthly', '2026-10-31')).toBe('2026-10-01')
    expect(await period('once', '2026-10-31')).toBe('2026-01-15')
  })
})

describe('ownership hand-over', () => {
  const p = { owner: '', adult: '', stranger: '', child: '', household: '' }

  beforeAll(async () => {
    p.owner = await newAdult('Otto')
    p.adult = await newAdult('Alma')
    p.stranger = await newAdult('Sid')
    p.household = await newHousehold(p.owner, 'HandoverHouse')
    await accept(p.adult, (await invite(p.owner, p.household, 'adult')).invite_token)
    p.child = await newChild(p.owner, p.household, 'Ivy')
  })

  const transfer = (actorId: string, to: string) =>
    as(db, user(actorId), () =>
      db.query('select public.transfer_household_ownership($1, $2)', [p.household, to]),
    )

  it('only goes to an adult member', async () => {
    expect(await pgErrorCode(() => transfer(p.owner, p.child))).toBe('22023')
    expect(await pgErrorCode(() => transfer(p.owner, p.stranger))).toBe('22023')
    expect(await pgErrorCode(() => transfer(p.owner, p.owner))).toBe('22023')
  })

  it("can't be started by anyone but the owner", async () => {
    expect(await pgErrorCode(() => transfer(p.adult, p.adult))).toBe('42501')
  })

  it('makes the new owner the owner and the old one an admin', async () => {
    await transfer(p.owner, p.adult)
    expect(await roleOf(p.household, p.adult)).toBe('owner')
    expect(await roleOf(p.household, p.owner)).toBe('admin')
  })
})

describe('deleting your account', () => {
  const blockers = (actorId: string) =>
    as(db, user(actorId), () =>
      db.query<{ household_name: string }>('select * from public.account_deletion_blockers()'),
    )
  const prepare = (actorId: string) =>
    as(db, user(actorId), () => db.query('select public.prepare_account_deletion()'))

  it('waits until households you own have been handed over or emptied', async () => {
    const owner = await newAdult('Nora')
    const other = await newAdult('Nils')
    const household = await newHousehold(owner, 'BusyHouse')
    await accept(other, (await invite(owner, household, 'adult')).invite_token)

    expect((await blockers(owner)).rows.map((r) => r.household_name)).toEqual(['The Joneses'])
    expect(await pgErrorCode(() => prepare(owner))).toBe('55000')
  })

  it('takes households you own alone, and your private lists, with you', async () => {
    const owner = await newAdult('Solo')
    const household = await newHousehold(owner, 'SoloHouse')
    await prepare(owner)
    const { rows } = await db.query('select id from public.households where id = $1', [household])
    expect(rows).toEqual([])
  })

  it("isn't for children (parents manage their accounts)", async () => {
    const parent = await newAdult('Pam')
    const household = await newHousehold(parent, 'KidAccountHouse')
    const child = await newChild(parent, household)
    expect(await pgErrorCode(() => prepare(child))).toBe('42501')
  })
})

describe('two-step sign-in', () => {
  const p = { owner: '', household: '' }

  beforeAll(async () => {
    p.owner = await newAdult('Mona')
    p.household = await newHousehold(p.owner, 'MfaHouse')
    await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [
      p.owner,
    ])
  })

  const seen = async (aal: 'aal1' | 'aal2') =>
    as(db, user(p.owner, aal), async () => ({
      households: (await db.query('select id from public.households where id = $1', [p.household]))
        .rows.length,
      profile: (await db.query('select id from public.profiles where id = $1', [p.owner])).rows
        .length,
      details: (
        await db.query('select profile_id from public.account_details where profile_id = $1', [
          p.owner,
        ])
      ).rows.length,
    }))

  it('once turned on, hides everything from a password-only session', async () => {
    expect(await seen('aal1')).toEqual({ households: 0, profile: 0, details: 0 })
  })

  it('shows it all again after the second step', async () => {
    expect(await seen('aal2')).toEqual({ households: 1, profile: 1, details: 1 })
  })

  it("doesn't apply to a factor that was never verified", async () => {
    const other = await newAdult('Uma')
    const household = await newHousehold(other, 'HalfMfaHouse')
    await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')`, [
      other,
    ])
    const { rows } = await as(db, user(other, 'aal1'), () =>
      db.query('select id from public.households where id = $1', [household]),
    )
    expect(rows).toHaveLength(1)
  })
})

describe('privileges', () => {
  it.each([
    ['anon', 'public.create_household(text,text,integer)'],
    ['anon', 'public.transfer_household_ownership(uuid,uuid)'],
    ['anon', 'public.prepare_account_deletion()'],
    ['anon', 'public.complete_chore(uuid,date)'],
    ['anon', 'public.household_points(uuid)'],
    ['authenticated', 'private.chore_period_start(public.chore_repeat,date,date)'],
    ['anon', 'public.set_list_members(uuid,uuid[])'],
    ['anon', 'public.reorder_list_items(uuid,uuid[])'],
    ['authenticated', 'private.profile_can_see_list(uuid,uuid)'],
    ['anon', 'public.create_household_invite(uuid,public.household_role)'],
    ['anon', 'public.accept_household_invite(text)'],
    ['anon', 'public.set_household_member_role(uuid,uuid,public.household_role)'],
    ['authenticated', 'public.begin_child_account(uuid,uuid,text)'],
    ['authenticated', 'public.redeem_child_sign_in_code(text)'],
    ['authenticated', 'private.member_has_permission(uuid,uuid,public.household_permission)'],
    ['authenticated', 'private.sha256_hex(text)'],
    ['anon', 'public.my_household_permissions(uuid)'],
    ['anon', 'private.has_household_permission(uuid,public.household_permission)'],
    ['authenticated', 'private.handle_new_user()'],
    ['authenticated', 'private.record_household_address_change()'],
  ])('%s cannot execute %s', async (role, fn) => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege($1, $2, 'execute') as ok`,
      [role, fn],
    )
    expect(rows[0]?.ok).toBe(false)
  })

  it.each([
    ['authenticated', 'public.account_details', 'insert'],
    ['authenticated', 'public.household_address_history', 'insert'],
    ['anon', 'public.geo_cities', 'insert'],
    ['authenticated', 'public.geo_regions', 'delete'],
  ])('%s has no %s… %s privilege', async (role, table, privilege) => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_table_privilege($1, $2, $3) as ok`,
      [role, table, privilege],
    )
    expect(rows[0]?.ok).toBe(false)
  })

  it('new tables and functions are not exposed until a migration grants them', async () => {
    await db.exec(`create table public.__probe (id int primary key)`)
    await db.exec(`create function public.__probe_fn() returns int language sql as 'select 1'`)
    const { rows } = await db.query<Record<string, boolean>>(`
      select
        has_table_privilege('anon', 'public.__probe', 'select') as anon_table,
        has_table_privilege('authenticated', 'public.__probe', 'select') as user_table,
        has_function_privilege('anon', 'public.__probe_fn()', 'execute') as anon_fn,
        has_function_privilege('authenticated', 'public.__probe_fn()', 'execute') as user_fn
    `)
    expect(rows[0]).toEqual({
      anon_table: false,
      user_table: false,
      anon_fn: false,
      user_fn: false,
    })
    await db.exec(`drop function public.__probe_fn(); drop table public.__probe;`)
  })

  it('every public table has RLS enabled', async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `)
    expect(rows.map((r) => r.relname)).toEqual([])
  })
})
