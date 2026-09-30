-- ============================================================================
-- Households.xyz: places, sign-up details, per-city household addresses
-- ============================================================================
-- Decisions (NEXT.md, 2026-09-29):
--   * A household's address is /<country>/<region>/<city>/<name>, and the name
--     is unique per city (case-insensitive).
--   * When a household moves, its old address keeps working as a redirect, but
--     only for people who could already see the household.
--   * Sign-up collects first and last name, date of birth (18+ only), phone and
--     home city. Date of birth and phone live in account_details, readable only
--     by the account owner, and are removed from auth metadata so they never
--     travel inside access tokens.
--   * Place data comes from GeoNames (CC BY 4.0), loaded by `pnpm geo:import`.
-- ============================================================================


-- ── 1. Places (reference data, public read-only) ────────────────────────────

create table public.geo_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null check (char_length(name) between 1 and 100)
);

create table public.geo_regions (
  -- GeoNames admin1 code, e.g. 'US.CA'. Countries without regions get a
  -- synthetic '<CC>.00' region named after the country.
  id text primary key check (char_length(id) between 4 and 24),
  country_code text not null references public.geo_countries (code),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  unique (country_code, slug)
);

create table public.geo_cities (
  id integer primary key, -- GeoNames geonameid
  region_id text not null references public.geo_regions (id),
  country_code text not null references public.geo_countries (code),
  name text not null check (char_length(name) between 1 and 200),
  ascii_name text not null check (char_length(ascii_name) between 1 and 200),
  -- County/district, to tell same-named towns in one region apart.
  district text check (char_length(district) <= 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  population integer not null default 0 check (population >= 0),
  unique (region_id, slug)
);

create index geo_regions_country_name_idx on public.geo_regions (country_code, name);
create index geo_cities_country_idx on public.geo_cities (country_code);
-- Type-ahead search: prefix match on the ASCII name within a region.
create index geo_cities_search_idx on public.geo_cities (region_id, lower(ascii_name) text_pattern_ops);

alter table public.geo_countries enable row level security;
alter table public.geo_regions enable row level security;
alter table public.geo_cities enable row level security;
revoke all on public.geo_countries, public.geo_regions, public.geo_cities from anon, authenticated;

create policy "geo_countries: public reference data" on public.geo_countries
  for select to anon, authenticated using (true);
create policy "geo_regions: public reference data" on public.geo_regions
  for select to anon, authenticated using (true);
create policy "geo_cities: public reference data" on public.geo_cities
  for select to anon, authenticated using (true);

-- Read-only for everyone (sign-up needs it before there is a session).
-- Writes happen only through `pnpm geo:import` as the database owner.
grant select on public.geo_countries, public.geo_regions, public.geo_cities to anon, authenticated;


-- ── 2. Profiles: real names and home city ───────────────────────────────────

alter table public.profiles
  add column first_name text check (char_length(btrim(first_name)) between 1 and 50),
  add column last_name text check (char_length(btrim(last_name)) between 1 and 50),
  add column city_id integer references public.geo_cities (id),
  -- Children are never locatable, not even to the city.
  add constraint profiles_child_no_location check (account_type <> 'child' or city_id is null);

create index profiles_city_id_idx on public.profiles (city_id);

grant update (first_name, last_name, city_id) on public.profiles to authenticated;

-- The profile row is created in a BEFORE INSERT trigger on auth.users (below),
-- so its foreign key to auth.users must be checked at commit time instead.
alter table public.profiles alter constraint profiles_id_fkey deferrable initially deferred;


-- ── 3. Account details: private to the account owner ────────────────────────

create table public.account_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth date not null check (date_of_birth > date '1900-01-01'),
  -- E.164, e.g. +14155550123. Normalized by the client; format enforced here.
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_details is
  'Sensitive sign-up details. Only the account owner can read them; co-members cannot.';

create trigger account_details_set_updated_at
  before update on public.account_details
  for each row execute function private.set_updated_at();

-- A changed phone number is unverified again.
create function private.reset_phone_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger account_details_reset_phone_verification
  before update of phone on public.account_details
  for each row execute function private.reset_phone_verification();

alter table public.account_details enable row level security;
revoke all on public.account_details from anon, authenticated;

create policy "account_details: owner reads"
  on public.account_details for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "account_details: owner updates"
  on public.account_details for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select on public.account_details to authenticated;
-- Only the phone is user-editable. Date of birth changes go through support,
-- so the 18+ rule can't be sidestepped after sign-up.
grant update (phone) on public.account_details to authenticated;

revoke all on function private.reset_phone_verification() from public, anon, authenticated;


-- ── 4. New users: validate sign-up details, keep sensitive data out of tokens ─

drop trigger on_auth_user_created on auth.users;
drop function private.handle_new_user();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text := nullif(btrim(m ->> 'first_name'), '');
  v_last text := nullif(btrim(m ->> 'last_name'), '');
  v_phone text := nullif(btrim(m ->> 'phone'), '');
  v_dob date;
  v_city integer;
begin
  begin
    v_dob := (m ->> 'date_of_birth')::date;
    v_city := (m ->> 'city_id')::integer;
  exception when others then
    raise exception 'Invalid sign-up details.' using errcode = '22023';
  end;

  if v_first is null or v_last is null or v_phone is null or v_dob is null or v_city is null then
    raise exception 'Missing sign-up details.' using errcode = '22023';
  end if;

  -- Adults only: children are added by a parent from inside a household.
  if v_dob > (current_date - interval '18 years')::date then
    raise exception 'Accounts are for people aged 18 and over.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.geo_cities c where c.id = v_city) then
    raise exception 'Unknown city.' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, first_name, last_name, city_id)
  values (new.id, v_first || ' ' || v_last, v_first, v_last, v_city);

  insert into public.account_details (profile_id, date_of_birth, phone)
  values (new.id, v_dob, v_phone);

  -- Auth metadata is copied into every access token. Keep only the names.
  new.raw_user_meta_data := m - 'date_of_birth' - 'phone' - 'city_id';
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  before insert on auth.users
  for each row execute function private.handle_new_user();


-- ── 5. Households: the address is (city, name) ──────────────────────────────

alter table public.households add column city_id integer references public.geo_cities (id);

-- Names were globally unique; now they're unique per city.
alter table public.households drop constraint households_slug_key_key;
create unique index households_city_slug_unique on public.households (city_id, slug_key);

grant update (city_id) on public.households to authenticated;

-- Old addresses, so links keep working after a household moves or is renamed.
create table public.household_address_history (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  city_id integer not null references public.geo_cities (id),
  slug_key text not null,
  created_at timestamptz not null default now()
);

create index household_address_history_household_idx
  on public.household_address_history (household_id);
create index household_address_history_lookup_idx
  on public.household_address_history (city_id, slug_key, created_at desc);

alter table public.household_address_history enable row level security;
revoke all on public.household_address_history from anon, authenticated;

-- Only people who can see the household can follow its old address, so a
-- redirect never reveals where a private household went.
create policy "household_address_history: members follow redirects"
  on public.household_address_history for select to authenticated
  using (private.is_household_member(household_id, true));

create policy "household_address_history: anyone, for public households"
  on public.household_address_history for select to anon, authenticated
  using (
    exists (
      select 1 from public.households h
      where h.id = household_id and h.visibility = 'public'
    )
  );

grant select on public.household_address_history to anon, authenticated;

create function private.record_household_address_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.city_id is not null
     and (new.city_id is distinct from old.city_id or new.slug_key is distinct from old.slug_key) then
    insert into public.household_address_history (household_id, city_id, slug_key)
    values (old.id, old.city_id, old.slug_key);
  end if;
  return new;
end;
$$;

revoke all on function private.record_household_address_change() from public, anon, authenticated;

create trigger households_record_address_change
  after update of city_id, slug on public.households
  for each row execute function private.record_household_address_change();

-- Resolves /<country>/<region>/<city>/<name> to a household the caller may see.
-- Runs as the caller, so RLS decides: outsiders get nothing for private
-- households, exactly as for nonexistent ones.
create function public.resolve_household_address(
  p_country text,
  p_region text,
  p_city text,
  p_name text
)
returns table (household_id uuid, is_current boolean)
language sql
stable
set search_path = ''
as $$
  with city as (
    select c.id
    from public.geo_cities c
    join public.geo_regions r on r.id = c.region_id
    where c.country_code = upper(p_country)
      and r.slug = lower(p_region)
      and c.slug = lower(p_city)
  ),
  candidates as (
    select h.id as household_id, true as is_current, h.updated_at as at
    from public.households h
    join city on h.city_id = city.id
    where h.slug_key = lower(p_name)
    union all
    select a.household_id, false, a.created_at
    from public.household_address_history a
    join city on a.city_id = city.id
    where a.slug_key = lower(p_name)
  )
  select household_id, is_current
  from candidates
  order by is_current desc, at desc
  limit 1;
$$;

revoke all on function public.resolve_household_address(text, text, text, text) from public;
grant execute on function public.resolve_household_address(text, text, text, text) to anon, authenticated;

-- create_household now takes the city.
drop function public.create_household(text, text);

create function public.create_household(p_name text, p_slug text, p_city_id integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_user_id and p.account_type = 'child') then
    raise exception 'Child accounts cannot create households.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.geo_cities c where c.id = p_city_id) then
    raise exception 'Unknown city.' using errcode = '23514';
  end if;

  -- Abuse guard: cap how many households one person can own.
  if (
    select count(*) from public.household_members m
    where m.profile_id = v_user_id and m.role = 'owner'
  ) >= 10 then
    raise exception 'Household limit reached.' using errcode = '54000';
  end if;

  insert into public.households (name, slug, city_id)
  values (btrim(p_name), p_slug, p_city_id)
  returning id into v_household_id;

  insert into public.household_members (household_id, profile_id, role, status, joined_at)
  values (v_household_id, v_user_id, 'owner', 'active', now());

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text, integer) from public, anon;
grant execute on function public.create_household(text, text, integer) to authenticated;
