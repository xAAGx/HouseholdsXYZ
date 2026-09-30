import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

export const MIGRATIONS_DIR = join(import.meta.dirname, '../../../supabase/migrations')

/**
 * Just enough of Supabase's platform (roles, auth schema, default grants) to run
 * our migrations in-process with PGlite. This is a fast approximation for CI;
 * the hosted Supabase project remains the authority.
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
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  -- Two-step sign-in factors (GoTrue's table, reduced to what we read).
  create table auth.mfa_factors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    status text not null
  );
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.jwt() to anon, authenticated, service_role;

  -- Supabase's permissive platform defaults, which our migrations must override.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

/** A few real GeoNames places, enough to exercise addresses and sign-up. */
export const PLACES = {
  sanFrancisco: 5391959,
  newYorkCity: 5128581,
  cairo: 360630,
} as const

const PLACES_SEED = /* sql */ `
  insert into public.geo_countries (code, name) values ('US', 'United States'), ('EG', 'Egypt');
  insert into public.geo_regions (id, country_code, name, slug) values
    ('US.CA', 'US', 'California', 'california'),
    ('US.NY', 'US', 'New York', 'new-york'),
    ('EG.11', 'EG', 'Cairo Governorate', 'cairo-governorate');
  insert into public.geo_cities (id, region_id, country_code, name, ascii_name, slug, population) values
    (${PLACES.sanFrancisco}, 'US.CA', 'US', 'San Francisco', 'San Francisco', 'san-francisco', 808437),
    (${PLACES.newYorkCity}, 'US.NY', 'US', 'New York City', 'New York City', 'new-york-city', 8804190),
    (${PLACES.cairo}, 'EG.11', 'EG', 'Cairo', 'Cairo', 'cairo', 9606916);
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
  await db.exec(PLACES_SEED)
  return db
}

export type Actor =
  { kind: 'anon' } | { kind: 'user'; id: string; aal: 'aal1' | 'aal2' } | { kind: 'service' }

export const anon: Actor = { kind: 'anon' }
/** A signed-in user; `aal2` once they've passed two-step sign-in. */
export const user = (id: string, aal: 'aal1' | 'aal2' = 'aal1'): Actor => ({
  kind: 'user',
  id,
  aal,
})
/** The API's secret-key client (child accounts only). */
export const service: Actor = { kind: 'service' }

const ROLE_FOR: Record<Actor['kind'], string> = {
  anon: 'anon',
  user: 'authenticated',
  service: 'service_role',
}

/** Runs `fn` with the same role + JWT subject PostgREST would set for `actor`. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const sub = actor.kind === 'user' ? actor.id : ''
  const claims = actor.kind === 'user' ? JSON.stringify({ sub, aal: actor.aal }) : ''
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
  await db.exec(`set role ${ROLE_FOR[actor.kind]}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

/** Valid sign-up details, as the web sign-up form sends them. */
export const VALID_SIGN_UP = {
  first_name: 'Test',
  last_name: 'Person',
  date_of_birth: '1990-01-01',
  phone: '+14155550100',
  city_id: PLACES.sanFrancisco,
}

/** Inserts an auth user the way GoTrue does, with exactly this metadata. */
export async function insertAuthUser(db: PGlite, meta: Record<string, unknown>): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (raw_user_meta_data) values ($1) returning id',
    [meta],
  )
  const id = rows[0]?.id
  if (!id) throw new Error('failed to create auth user')
  return id
}

/** Signs up a valid adult, overriding any sign-up fields given. */
export function createAuthUser(db: PGlite, overrides: Record<string, unknown> = {}) {
  return insertAuthUser(db, { ...VALID_SIGN_UP, ...overrides })
}
