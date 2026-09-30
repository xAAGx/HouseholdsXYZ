import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  anon,
  as,
  createAuthUser,
  createTestDatabase,
  insertAuthUser,
  PLACES,
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

  it('never lets a child account become discoverable', async () => {
    const code = await as(db, user(ids.child), () =>
      pgErrorCode(() =>
        db.query('update public.profiles set is_discoverable = true where id = $1', [ids.child]),
      ),
    )
    expect(code).toBe('23514')
  })

  it('never give a child account a location', async () => {
    const code = await as(db, user(ids.child), () =>
      pgErrorCode(() =>
        db.query('update public.profiles set city_id = $1 where id = $2', [
          PLACES.sanFrancisco,
          ids.child,
        ]),
      ),
    )
    expect(code).toBe('23514')
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

describe('privileges', () => {
  it.each([
    ['anon', 'public.create_household(text,text,integer)'],
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
