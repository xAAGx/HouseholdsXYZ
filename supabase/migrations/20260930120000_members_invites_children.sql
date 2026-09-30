-- ============================================================================
-- Households.xyz: member roles, invite links, parent-managed child accounts
-- ============================================================================
-- Read SECURITY.md first. New here:
--   - Adults join by single-use invite links. Only a SHA-256 hash of a link's
--     token is stored; the token itself sits after '#' in the link, so it
--     never reaches a server or a log.
--   - Children have parent-managed accounts: no email, no password, no self
--     sign-up. A parent with manage_children asks the API to create one; the
--     API (the only holder of the Supabase secret key) registers a one-time
--     set-up secret here, then creates the login, and private.handle_new_user()
--     redeems the secret. Without a valid secret no child account can exist.
--   - Children sign in with a one-time code a parent shows them. Codes are
--     hashed, expire after 10 minutes and work once.
--   - Child accounts only ever hold the child or teen role; adult accounts
--     never do.
-- ============================================================================


-- ── 1. Small helpers ────────────────────────────────────────────────────────

create function private.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_value, 'UTF8')), 'hex');
$$;

-- 64 hex characters from two v4 UUIDs: 244 random bits from the server's
-- cryptographic random source.
create function private.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- private.has_household_permission() answers for the caller (auth.uid()).
-- Server-side flows without an end-user session (child account set-up) need
-- the same rule for a given profile.
create function private.member_has_permission(
  p_profile_id uuid,
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
      and m.profile_id = p_profile_id
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

revoke all on function private.sha256_hex(text) from public, anon, authenticated;
revoke all on function private.random_token() from public, anon, authenticated;
revoke all on function private.member_has_permission(uuid, uuid, public.household_permission)
  from public, anon, authenticated;


-- ── 2. Roles follow the account type ────────────────────────────────────────

create function private.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.account_type;
begin
  select p.account_type into v_type from public.profiles p where p.id = new.profile_id;
  if v_type = 'child' and new.role not in ('child', 'teen') then
    raise exception 'Child accounts can only have the child or teen role.' using errcode = '23514';
  end if;
  if v_type = 'standard' and new.role in ('child', 'teen') then
    raise exception 'Adult accounts cannot have the child or teen role.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_member_role() from public, anon, authenticated;

create trigger household_members_guard_role
  before insert or update of role, profile_id on public.household_members
  for each row execute function private.guard_member_role();


-- ── 3. Children's profiles are managed by their parents ─────────────────────

drop policy "profiles: update self" on public.profiles;

create policy "profiles: adults update themselves"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and account_type = 'standard')
  with check (id = (select auth.uid()) and account_type = 'standard');


-- ── 4. Changing a member's role ─────────────────────────────────────────────

create function public.set_household_member_role(
  p_household_id uuid,
  p_profile_id uuid,
  p_role public.household_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_current public.household_role;
begin
  select m.role into v_current
  from public.household_members m
  where m.household_id = p_household_id
    and m.profile_id = p_profile_id
    and m.status = 'active';

  -- One error for "no such member" and "not allowed", so nothing leaks.
  -- Ownership moves through a separate, owner-only flow (not built yet).
  if v_caller is null
     or v_current is null
     or p_role is null
     or p_profile_id = v_caller
     or v_current = 'owner'
     or p_role = 'owner'
     or not private.has_household_permission(p_household_id, 'manage_members')
     or ((v_current = 'admin' or p_role = 'admin')
         and private.household_role(p_household_id) is distinct from 'owner')
     or ((v_current in ('child', 'teen') or p_role in ('child', 'teen'))
         and not private.has_household_permission(p_household_id, 'manage_children')) then
    raise exception 'You can''t change this member''s role.' using errcode = '42501';
  end if;

  -- private.guard_member_role() rejects roles that don't fit the account type.
  update public.household_members
  set role = p_role
  where household_id = p_household_id and profile_id = p_profile_id;
end;
$$;

revoke all on function public.set_household_member_role(uuid, uuid, public.household_role)
  from public, anon;
grant execute on function public.set_household_member_role(uuid, uuid, public.household_role)
  to authenticated;


-- ── 5. Invite links (adults) ────────────────────────────────────────────────

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- SHA-256 of the link's token. The token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Adults only: children get parent-managed accounts instead.
  role public.household_role not null check (role in ('admin', 'adult', 'caregiver', 'guest')),
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index household_invites_household_idx on public.household_invites (household_id);
create index household_invites_created_by_idx on public.household_invites (created_by);
create index household_invites_accepted_by_idx on public.household_invites (accepted_by);

alter table public.household_invites enable row level security;
revoke all on public.household_invites from anon, authenticated;

create policy "household_invites: inviters see their household's invites"
  on public.household_invites for select to authenticated
  using (private.has_household_permission(household_id, 'invite_members'));

create policy "household_invites: inviters revoke open invites"
  on public.household_invites for delete to authenticated
  using (
    accepted_at is null
    and private.has_household_permission(household_id, 'invite_members')
    and (role <> 'admin' or private.household_role(household_id) = 'owner')
  );

-- Every column except the token hash.
grant select (id, household_id, role, created_by, expires_at, accepted_by, accepted_at, created_at)
  on public.household_invites to authenticated;
grant delete on public.household_invites to authenticated;
-- No INSERT/UPDATE grants: invites are created and accepted through RPCs.

create function public.create_household_invite(p_household_id uuid, p_role public.household_role)
returns table (invite_id uuid, invite_token text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_token text := private.random_token();
  v_expires timestamptz := now() + interval '7 days';
  v_id uuid;
begin
  if v_caller is null
     or not private.has_household_permission(p_household_id, 'invite_members')
     or (p_role = 'admin' and private.household_role(p_household_id) is distinct from 'owner') then
    raise exception 'You can''t invite people to this household.' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('admin', 'adult', 'caregiver', 'guest') then
    raise exception 'Invites are for adults. Add children from the household page.'
      using errcode = '22023';
  end if;

  -- Abuse guard: a bounded number of open invites per household.
  if (
    select count(*) from public.household_invites i
    where i.household_id = p_household_id and i.accepted_at is null and i.expires_at > now()
  ) >= 50 then
    raise exception 'Too many open invites.' using errcode = '54000';
  end if;

  insert into public.household_invites (household_id, token_hash, role, created_by, expires_at)
  values (p_household_id, private.sha256_hex(v_token), p_role, v_caller, v_expires)
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

-- What an invite is for, shown before accepting. Signed-in adults only, and
-- only for open invites, so a stale or leaked link reveals nothing.
create function public.get_household_invite(p_token text)
returns table (
  household_name text,
  city_name text,
  region_name text,
  country_code text,
  invite_role public.household_role,
  invited_by text,
  invite_expires_at timestamptz,
  already_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    h.name,
    c.name,
    r.name,
    c.country_code,
    i.role,
    p.display_name,
    i.expires_at,
    exists (
      select 1 from public.household_members m
      where m.household_id = i.household_id and m.profile_id = (select auth.uid())
    )
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.geo_cities c on c.id = h.city_id
  left join public.geo_regions r on r.id = c.region_id
  left join public.profiles p on p.id = i.created_by
  where i.token_hash = private.sha256_hex(p_token)
    and i.accepted_at is null
    and i.expires_at > now()
    and exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid()) and me.account_type = 'standard'
    );
$$;

create function public.accept_household_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_invite public.household_invites;
begin
  if v_caller is null or not exists (
    select 1 from public.profiles p where p.id = v_caller and p.account_type = 'standard'
  ) then
    raise exception 'Only adult accounts can accept invites.' using errcode = '42501';
  end if;

  select * into v_invite
  from public.household_invites i
  where i.token_hash = private.sha256_hex(p_token)
  for update;

  if not found or v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception 'This invite link is no longer valid.' using errcode = 'P0002';
  end if;

  -- Already in the household: nothing to do, and the link isn't used up.
  if exists (
    select 1 from public.household_members m
    where m.household_id = v_invite.household_id and m.profile_id = v_caller
  ) then
    return v_invite.household_id;
  end if;

  -- Abuse guard: cap how many households one person can belong to.
  if (select count(*) from public.household_members m where m.profile_id = v_caller) >= 50 then
    raise exception 'Household limit reached.' using errcode = '54000';
  end if;

  insert into public.household_members (household_id, profile_id, role, status, joined_at, invited_by)
  values (v_invite.household_id, v_caller, v_invite.role, 'active', now(), v_invite.created_by);

  update public.household_invites
  set accepted_by = v_caller, accepted_at = now()
  where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function public.create_household_invite(uuid, public.household_role) from public, anon;
revoke all on function public.get_household_invite(text) from public, anon;
revoke all on function public.accept_household_invite(text) from public, anon;
grant execute on function public.create_household_invite(uuid, public.household_role) to authenticated;
grant execute on function public.get_household_invite(text) to authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;


-- ── 6. Child accounts ───────────────────────────────────────────────────────

-- One-time set-up secrets for child logins being created (see header).
create table private.pending_child_accounts (
  secret_hash text primary key check (secret_hash ~ '^[0-9a-f]{64}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

alter table private.pending_child_accounts enable row level security;
revoke all on private.pending_child_accounts from public, anon, authenticated;

-- Called by the API as the service role, for a parent it has authenticated.
-- Returns the set-up secret, which the API hands straight to Supabase Auth.
create function public.begin_child_account(
  p_parent_id uuid,
  p_household_id uuid,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := private.random_token();
  v_name text := btrim(p_display_name);
begin
  if p_parent_id is null
     or not private.member_has_permission(p_parent_id, p_household_id, 'manage_children') then
    raise exception 'Not allowed to add children to this household.' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'Give the child a name of 1 to 50 characters.' using errcode = '22023';
  end if;

  -- Abuse guard: a bounded number of child accounts per household.
  if (
    select count(*) from public.household_members m
    where m.household_id = p_household_id and m.role in ('child', 'teen')
  ) >= 20 then
    raise exception 'Child account limit reached.' using errcode = '54000';
  end if;

  delete from private.pending_child_accounts pca where pca.expires_at <= now();

  insert into private.pending_child_accounts (secret_hash, household_id, created_by, display_name)
  values (private.sha256_hex(v_secret), p_household_id, p_parent_id, v_name);

  return v_secret;
end;
$$;

-- New users: children (with a valid set-up secret) or adults (with valid
-- sign-up details). Anything else is rejected.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_pending private.pending_child_accounts;
  v_first text := nullif(btrim(m ->> 'first_name'), '');
  v_last text := nullif(btrim(m ->> 'last_name'), '');
  v_phone text := nullif(btrim(m ->> 'phone'), '');
  v_dob date;
  v_city integer;
begin
  -- A child login, created by the API for a parent.
  if m ? 'child_setup' then
    delete from private.pending_child_accounts pca
    where pca.secret_hash = private.sha256_hex(m ->> 'child_setup')
      and pca.expires_at > now()
    returning * into v_pending;

    if not found then
      raise exception 'Invalid child account set-up.' using errcode = '22023';
    end if;

    -- The parent may have lost the permission in the meantime.
    if not private.member_has_permission(v_pending.created_by, v_pending.household_id, 'manage_children') then
      raise exception 'Not allowed to add children to this household.' using errcode = '42501';
    end if;

    insert into public.profiles (id, display_name, account_type)
    values (new.id, v_pending.display_name, 'child');

    insert into public.household_members (household_id, profile_id, role, status, joined_at, invited_by)
    values (v_pending.household_id, new.id, 'child', 'active', now(), v_pending.created_by);

    -- Nothing about the child travels in its tokens.
    new.raw_user_meta_data := '{}'::jsonb;
    return new;
  end if;

  begin
    v_dob := (m ->> 'date_of_birth')::date;
    v_city := (m ->> 'city_id')::integer;
  exception when others then
    raise exception 'Invalid sign-up details.' using errcode = '22023';
  end;

  if v_first is null or v_last is null or v_phone is null or v_dob is null or v_city is null then
    raise exception 'Missing sign-up details.' using errcode = '22023';
  end if;

  -- Adults only: children get parent-managed accounts (above).
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

-- Sign-in codes: at most one open code per child.
create table private.child_sign_in_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  child_id uuid not null unique references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null
);

alter table private.child_sign_in_codes enable row level security;
revoke all on private.child_sign_in_codes from public, anon, authenticated;

-- True when the caller may manage this child's account in this household.
create function public.can_manage_child(p_household_id uuid, p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_household_permission(p_household_id, 'manage_children')
    and exists (
      select 1
      from public.household_members m
      join public.profiles p on p.id = m.profile_id
      where m.household_id = p_household_id
        and m.profile_id = p_child_id
        and m.status = 'active'
        and p.account_type = 'child'
    );
$$;

-- A parent creates a code for their child to sign in with. Replaces any
-- earlier code for that child.
create function public.create_child_sign_in_code(p_household_id uuid, p_child_id uuid)
returns table (sign_in_code text, code_expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Mirrored in packages/shared/src/children/sign-in-code.ts; a test keeps them in sync.
  -- No I, O, 0 or 1, which are easy to confuse. 32 symbols, so byte % 32 is unbiased.
  -- @child-code-alphabet:begin
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- @child-code-alphabet:end
  v_caller uuid := (select auth.uid());
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
  v_expires timestamptz := now() + interval '10 minutes';
  i int;
begin
  if v_caller is null or not public.can_manage_child(p_household_id, p_child_id) then
    raise exception 'You can''t manage this child''s account.' using errcode = '42501';
  end if;

  -- 8 symbols = 40 random bits. Bytes 6 and 8 of a v4 UUID carry fixed
  -- version and variant bits, so only fully random bytes are used.
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    v_code := v_code || substr(c_alphabet, get_byte(v_bytes, i) % 32 + 1, 1);
  end loop;

  delete from private.child_sign_in_codes c
  where c.child_id = p_child_id or c.expires_at <= now();

  insert into private.child_sign_in_codes (code_hash, child_id, created_by, expires_at)
  values (private.sha256_hex(v_code), p_child_id, v_caller, v_expires);

  return query select v_code, v_expires;
end;
$$;

-- Called by the API as the service role: uses up a code and returns the child
-- it belongs to, or null. The API then issues that child a sign-in token.
create function public.redeem_child_sign_in_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_child uuid;
begin
  delete from private.child_sign_in_codes c
  where c.code_hash = private.sha256_hex(upper(p_code))
    and c.expires_at > now()
  returning c.child_id into v_child;

  -- Belt and braces: a code only ever unlocks a child account.
  if v_child is null or not exists (
    select 1 from public.profiles p where p.id = v_child and p.account_type = 'child'
  ) then
    return null;
  end if;

  return v_child;
end;
$$;

revoke all on function public.begin_child_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_child_sign_in_code(text) from public, anon, authenticated;
revoke all on function public.can_manage_child(uuid, uuid) from public, anon;
revoke all on function public.create_child_sign_in_code(uuid, uuid) from public, anon;
grant execute on function public.begin_child_account(uuid, uuid, text) to service_role;
grant execute on function public.redeem_child_sign_in_code(text) to service_role;
grant execute on function public.can_manage_child(uuid, uuid) to authenticated;
grant execute on function public.create_child_sign_in_code(uuid, uuid) to authenticated;
