import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { anon, as, createAuthUser, createTestDatabase, user } from './supabase-shim'

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

beforeAll(async () => {
  db = await createTestDatabase()
  ids.owner = await createAuthUser(db, { display_name: 'Pat' })
  ids.adult = await createAuthUser(db, { display_name: 'Sam' })
  ids.child = await createAuthUser(db, { display_name: 'Kid' })
  ids.stranger = await createAuthUser(db)
  await db.query(`update public.profiles set account_type = 'child' where id = $1`, [ids.child])

  ids.household = await as(db, user(ids.owner), async () => {
    const { rows } = await db.query<{ id: string }>(
      `select public.create_household('The Smiths', 'TheSmithsHouse') as id`,
    )
    return rows[0]!.id
  })
  await db.query(
    `insert into public.household_members (household_id, profile_id, role, status, joined_at)
     values ($1, $2, 'adult', 'active', now()), ($1, $3, 'child', 'active', now())`,
    [ids.household, ids.adult, ids.child],
  )
}, 60_000)

describe('profiles', () => {
  it('are created on sign-up without deriving names from email', async () => {
    const { rows } = await db.query<{ display_name: string }>(
      'select display_name from public.profiles where id = $1',
      [ids.stranger],
    )
    expect(rows[0]?.display_name).toBe('New member')
  })

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

  it("cannot edit someone else's profile", async () => {
    const result = await as(db, user(ids.adult), () =>
      db.query(`update public.profiles set display_name = 'x' where id = $1`, [ids.owner]),
    )
    expect(result.affectedRows).toBe(0)
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
    ['taken (case-insensitive)', 'thesmithshouse', '23505'],
    ['reserved', 'Admin', '23514'],
    ['malformed', 'a--b', '23514'],
  ])('reject %s slugs', async (_label, slug, expected) => {
    const code = await as(db, user(ids.stranger), () =>
      pgErrorCode(() => db.query('select public.create_household($1, $2)', ['X', slug])),
    )
    expect(code).toBe(expected)
  })

  it('cannot be created by child accounts or anonymous visitors', async () => {
    for (const actor of [user(ids.child), anon]) {
      const code = await as(db, actor, () =>
        pgErrorCode(() => db.query(`select public.create_household('X', 'otherhouse')`)),
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
      db.query('select * from public.household_members'),
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
      db.query('delete from public.household_members where profile_id = $1', [ids.owner]),
    )
    expect(ownerRemoved.affectedRows).toBe(0)

    const ownerLeaves = await as(db, user(ids.owner), () =>
      db.query('delete from public.household_members where profile_id = $1', [ids.owner]),
    )
    expect(ownerLeaves.affectedRows).toBe(0)
  })
})

describe('privileges', () => {
  it.each([
    ['anon', 'public.create_household(text,text)'],
    ['anon', 'public.my_household_permissions(uuid)'],
    ['anon', 'private.has_household_permission(uuid,public.household_permission)'],
    ['authenticated', 'private.handle_new_user()'],
  ])('%s cannot execute %s', async (role, fn) => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege($1, $2, 'execute') as ok`,
      [role, fn],
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
