import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

export const MIGRATIONS_DIR = join(import.meta.dirname, '../../../supabase/migrations')

/**
 * Just enough of Supabase's platform (roles, auth schema, default grants) to run
 * our migrations in-process with PGlite. This is a fast approximation for CI;
 * the real stack (`supabase start` + `supabase test db`) remains the authority.
 */
const SUPABASE_SHIM = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;

  create schema auth;
  create schema extensions;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- Supabase's permissive platform defaults, which our migrations must override.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_SHIM)
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
  return db
}

export type Actor = { kind: 'anon' } | { kind: 'user'; id: string }

export const anon: Actor = { kind: 'anon' }
export const user = (id: string): Actor => ({ kind: 'user', id })

/** Runs `fn` with the same role + JWT subject PostgREST would set for `actor`. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const sub = actor.kind === 'user' ? actor.id : ''
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  await db.exec(`set role ${actor.kind === 'user' ? 'authenticated' : 'anon'}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

export async function createAuthUser(
  db: PGlite,
  meta: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (raw_user_meta_data) values ($1) returning id',
    [meta],
  )
  const id = rows[0]?.id
  if (!id) throw new Error('failed to create auth user')
  return id
}
