-- ============================================================================
-- Households.xyz: core identity, households, membership & permissions
-- ============================================================================
-- Security model (read SECURITY.md before changing anything here):
--   1. Row Level Security is enabled on every table. No policy = no access.
--   2. Privileges are explicit. New tables, sequences and functions get no
--      grants for anon/authenticated until a migration adds them, and UPDATE
--      grants are column-scoped so a role can only change the fields it owns.
--   3. SECURITY DEFINER helpers live in the `private` schema (not exposed by
--      the Data API) and pin `search_path = ''`, so every reference is
--      schema-qualified and can't be hijacked.
--   4. Clients never write memberships directly. Privileged mutations go
--      through narrow RPCs that re-check authorization inside the database.
--   5. Collect less: no emails, phone numbers or street addresses in public
--      tables. Location is a coarse, user-entered area only.
-- ============================================================================


-- ── 1. No implicit privileges ───────────────────────────────────────────────

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- EXECUTE-to-PUBLIC is a global built-in default, so it can only be revoked globally
-- (for objects created by the migration role, not for Supabase's own functions).
alter default privileges revoke execute on functions from public;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Policies run as the querying role, so it needs to reach the helper functions.
-- The schema itself is never exposed through the Data API.
grant usage on schema private to authenticated;


-- ── 2. Types ────────────────────────────────────────────────────────────────

create type public.account_type as enum ('standard', 'child');

create type public.household_role as enum (
  'owner', 'admin', 'adult', 'teen', 'child', 'caregiver', 'guest'
);

create type public.household_permission as enum (
  'manage_household',
  'invite_members',
  'manage_members',
  'manage_children',
  'create_posts',
  'moderate_content',
  'publish_public',
  'view_expenses',
  'manage_expenses',
  'view_documents',
  'manage_documents',
  'manage_chores',
  'manage_calendar'
);

create type public.membership_status as enum ('invited', 'active', 'suspended');

-- Who can see a household's profile page. Content has its own per-item audience.
create type public.household_visibility as enum ('private', 'connections', 'neighborhood', 'public');

-- Per-item audience for posts, photos, events, notes, and so on.
-- Ordered from narrowest to widest audience; code relies on this order.
create type public.content_visibility as enum (
  'private', 'selected_members', 'household', 'connections', 'neighborhood', 'public'
);


-- ── 3. Shared trigger functions ─────────────────────────────────────────────

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ── 4. Profiles ─────────────────────────────────────────────────────────────
-- One row per auth user, created by trigger. Email and phone stay in
-- auth.users and are never copied here.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  avatar_path text check (char_length(avatar_path) <= 512),
  account_type public.account_type not null default 'standard',
  -- Opt-in only. Child accounts can never be discoverable.
  is_discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_child_not_discoverable check (account_type <> 'child' or not is_discoverable)
);

comment on table public.profiles is 'Minimal public-facing identity. Contact details live only in auth.users.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;


-- ── 5. Households ───────────────────────────────────────────────────────────

create table public.households (
  id uuid primary key default gen_random_uuid(),
  -- Keeps the owner's casing for display (TheSmithsHouse). Uniqueness uses slug_key.
  -- ASCII only, which rules out look-alike (homoglyph) URLs.
  slug text not null check (slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9]$' and slug !~ '--'),
  slug_key text generated always as (lower(slug)) stored unique,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  bio text check (char_length(bio) <= 500),
  -- Coarse, user-entered area ("Kitsilano, Vancouver"). Never a street address or coordinates.
  area text check (char_length(area) <= 120),
  avatar_path text check (char_length(avatar_path) <= 512),
  cover_path text check (char_length(cover_path) <= 512),
  visibility public.household_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function private.set_updated_at();

alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;

-- Slugs that would collide with app routes or could be used to impersonate us.
-- Mirrored in packages/shared/src/households/slug.ts; a unit test keeps them in sync.
create table private.reserved_slugs (
  slug text primary key check (slug = lower(slug))
);

alter table private.reserved_slugs enable row level security;
revoke all on private.reserved_slugs from public, anon, authenticated;

insert into private.reserved_slugs (slug) values
-- @reserved-slugs:begin
  ('about'), ('account'), ('accounts'), ('admin'), ('administrator'), ('api'), ('app'),
  ('assets'), ('auth'), ('billing'), ('blog'), ('business'), ('cdn'), ('chat'), ('deals'),
  ('email'), ('explore'), ('help'), ('house'), ('household'), ('households'), ('invite'),
  ('invites'), ('legal'), ('login'), ('logout'), ('mail'), ('marketplace'), ('messages'),
  ('moderator'), ('neighborhood'), ('neighbourhood'), ('new'), ('notifications'), ('null'),
  ('official'), ('premium'), ('privacy'), ('profile'), ('register'), ('root'), ('search'),
  ('security'), ('settings'), ('sign-in'), ('sign-up'), ('signin'), ('signup'), ('staff'),
  ('static'), ('status'), ('support'), ('system'), ('team'), ('terms'), ('undefined'),
  ('verified'), ('verify'), ('www')
-- @reserved-slugs:end
;


-- ── 6. Memberships ──────────────────────────────────────────────────────────

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.household_role not null,
  status public.membership_status not null default 'invited',
  -- Per-member adjustments on top of the role defaults in household_role_permissions.
  granted_permissions public.household_permission[] not null default '{}',
  revoked_permissions public.household_permission[] not null default '{}',
  -- How this person relates to the household, such as "Grandma". Members only.
  relationship_label text check (char_length(relationship_label) <= 40),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_id),
  -- Children can only ever be granted a small, safe set of extra permissions.
  constraint household_members_child_permission_ceiling
    check (role <> 'child' or granted_permissions <@ array['create_posts']::public.household_permission[]),
  constraint household_members_active_has_joined_at
    check (status <> 'active' or joined_at is not null)
);

create unique index household_members_one_owner on public.household_members (household_id)
  where role = 'owner';
create index household_members_profile_id_idx on public.household_members (profile_id);
create index household_members_invited_by_idx on public.household_members (invited_by);

create trigger household_members_set_updated_at
  before update on public.household_members
  for each row execute function private.set_updated_at();

alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;

-- Default permissions per role. The owner implicitly has every permission.
-- Mirrored in packages/shared/src/permissions/roles.ts; a unit test keeps them in sync.
create table public.household_role_permissions (
  role public.household_role not null,
  permission public.household_permission not null,
  primary key (role, permission),
  constraint household_role_permissions_owner_implicit check (role <> 'owner')
);

alter table public.household_role_permissions enable row level security;
revoke all on public.household_role_permissions from anon, authenticated;

insert into public.household_role_permissions (role, permission) values
-- @role-permissions:begin
  ('admin', 'manage_household'),
  ('admin', 'invite_members'),
  ('admin', 'manage_members'),
  ('admin', 'manage_children'),
  ('admin', 'create_posts'),
  ('admin', 'moderate_content'),
  ('admin', 'publish_public'),
  ('admin', 'view_expenses'),
  ('admin', 'manage_expenses'),
  ('admin', 'view_documents'),
  ('admin', 'manage_documents'),
  ('admin', 'manage_chores'),
  ('admin', 'manage_calendar'),
  ('adult', 'invite_members'),
  ('adult', 'create_posts'),
  ('adult', 'view_expenses'),
  ('adult', 'manage_expenses'),
  ('adult', 'view_documents'),
  ('adult', 'manage_chores'),
  ('adult', 'manage_calendar'),
  ('teen', 'create_posts'),
  ('child', 'create_posts'),
  ('caregiver', 'create_posts'),
  ('caregiver', 'manage_chores'),
  ('caregiver', 'manage_calendar')
-- @role-permissions:end
;


-- ── 7. Authorization helpers ────────────────────────────────────────────────
-- SECURITY DEFINER so policies on household_members can call them without
-- recursing into their own RLS. Each one only ever answers questions about the
-- calling user (auth.uid()), never about arbitrary users.

create function private.is_household_member(p_household_id uuid, p_include_invited boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.profile_id = (select auth.uid())
      and (m.status = 'active' or (p_include_invited and m.status = 'invited'))
  );
$$;

create function private.household_role(p_household_id uuid)
returns public.household_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.household_members m
  where m.household_id = p_household_id
    and m.profile_id = (select auth.uid())
    and m.status = 'active';
$$;

create function private.has_household_permission(
  p_household_id uuid,
  p_permission public.household_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.profile_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'owner'
        or (
          not (p_permission = any (m.revoked_permissions))
          and (
            p_permission = any (m.granted_permissions)
            or exists (
              select 1
              from public.household_role_permissions rp
              where rp.role = m.role and rp.permission = p_permission
            )
          )
        )
      )
  );
$$;

-- True when the caller and p_profile_id are both in some household together.
-- Pending invitees are visible to members; invitees see nobody until they join.
create function private.shares_household_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.profile_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.profile_id = p_profile_id
      and theirs.status in ('active', 'invited')
  );
$$;

revoke all on function private.is_household_member(uuid, boolean) from public, anon;
revoke all on function private.household_role(uuid) from public, anon;
revoke all on function private.has_household_permission(uuid, public.household_permission) from public, anon;
revoke all on function private.shares_household_with(uuid) from public, anon;
grant execute on function private.is_household_member(uuid, boolean) to authenticated;
grant execute on function private.household_role(uuid) to authenticated;
grant execute on function private.has_household_permission(uuid, public.household_permission) to authenticated;
grant execute on function private.shares_household_with(uuid) to authenticated;


-- ── 8. Guards ───────────────────────────────────────────────────────────────

create function private.guard_household_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.reserved_slugs r where r.slug = lower(new.slug)) then
    raise exception 'This household URL is reserved.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger households_guard_slug
  before insert or update of slug on public.households
  for each row execute function private.guard_household_slug();

-- Making a household visible outside its members needs publish_public, not just
-- manage_household. Only enforced for end users; service jobs aren't affected.
create function private.guard_household_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility is distinct from old.visibility
     and new.visibility <> 'private'
     and current_user = 'authenticated'
     and not private.has_household_permission(new.id, 'publish_public') then
    raise exception 'Changing who can see this household requires the publish_public permission.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger households_guard_visibility
  before update of visibility on public.households
  for each row execute function private.guard_household_visibility();

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.guard_household_slug() from public, anon, authenticated;
revoke all on function private.guard_household_visibility() from public, anon, authenticated;


-- ── 9. Policies & grants ────────────────────────────────────────────────────

-- profiles
create policy "profiles: read self and household co-members"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_household_with(id));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.profiles to authenticated;
-- account_type is deliberately not updatable by users.
grant update (display_name, avatar_path, is_discoverable) on public.profiles to authenticated;

-- households
create policy "households: members and invitees can read"
  on public.households for select to authenticated
  using (private.is_household_member(id, true));

create policy "households: anyone can read public households"
  on public.households for select to anon, authenticated
  using (visibility = 'public');

create policy "households: managers can update"
  on public.households for update to authenticated
  using (private.has_household_permission(id, 'manage_household'))
  with check (private.has_household_permission(id, 'manage_household'));

create policy "households: owner can delete"
  on public.households for delete to authenticated
  using (private.household_role(id) = 'owner');

grant select on public.households to anon, authenticated;
grant update (slug, name, bio, area, avatar_path, cover_path, visibility) on public.households to authenticated;
grant delete on public.households to authenticated;
-- No INSERT grant: households are created through public.create_household().

-- household_members
create policy "household_members: members read their roster, invitees read their invite"
  on public.household_members for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_household_member(household_id));

create policy "household_members: leave, or be removed by a manager"
  on public.household_members for delete to authenticated
  using (
    role <> 'owner'
    and (
      -- Anyone but a child may leave. Children's memberships are managed by parents.
      (profile_id = (select auth.uid()) and role <> 'child')
      or (
        private.has_household_permission(household_id, 'manage_members')
        and (role <> 'child' or private.has_household_permission(household_id, 'manage_children'))
        and (role <> 'admin' or private.household_role(household_id) = 'owner')
      )
    )
  );

grant select, delete on public.household_members to authenticated;
-- No INSERT/UPDATE grants: invites, joins and role changes go through RPCs.

-- household_role_permissions (reference data)
create policy "household_role_permissions: readable when signed in"
  on public.household_role_permissions for select to authenticated
  using (true);

grant select on public.household_role_permissions to authenticated;


-- ── 10. RPCs ────────────────────────────────────────────────────────────────

-- Creates a household and makes the caller its owner, atomically.
create function public.create_household(p_name text, p_slug text)
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

  -- Abuse guard: cap how many households one person can own.
  if (
    select count(*) from public.household_members m
    where m.profile_id = v_user_id and m.role = 'owner'
  ) >= 10 then
    raise exception 'Household limit reached.' using errcode = '54000';
  end if;

  insert into public.households (name, slug)
  values (btrim(p_name), p_slug)
  returning id into v_household_id;

  insert into public.household_members (household_id, profile_id, role, status, joined_at)
  values (v_household_id, v_user_id, 'owner', 'active', now());

  return v_household_id;
end;
$$;

-- The caller's effective permissions in a household (empty if not a member).
-- UIs should use this rather than re-deriving permissions client-side.
create function public.my_household_permissions(p_household_id uuid)
returns public.household_permission[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(p.permission order by p.permission), '{}')
  from unnest(enum_range(null::public.household_permission)) as p (permission)
  where private.has_household_permission(p_household_id, p.permission);
$$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.my_household_permissions(uuid) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.my_household_permissions(uuid) to authenticated;


-- ── 11. Auth hook: create a profile for every new user ──────────────────────

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Never derive a name from the email address: co-members would see it.
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 80), ''), 'New member')
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
