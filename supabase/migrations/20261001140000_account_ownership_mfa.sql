-- ============================================================================
-- Households.xyz: two-step sign-in, ownership hand-over, account deletion
-- ============================================================================


-- ── 1. Two-step sign-in is enforced by the database ─────────────────────────
-- Someone who has turned on two-step sign-in (a verified TOTP factor) only
-- reaches household data with a session that passed it (aal2). A stolen
-- password alone (aal1) sees nothing: not through the API, not directly.
-- Every membership check goes through the helpers below, so the rule covers
-- every table and RPC that relies on them.

create function private.aal_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    );
$$;

revoke all on function private.aal_ok() from public, anon;
grant execute on function private.aal_ok() to authenticated;

create or replace function private.is_household_member(
  p_household_id uuid,
  p_include_invited boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aal_ok() and exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.profile_id = (select auth.uid())
      and (m.status = 'active' or (p_include_invited and m.status = 'invited'))
  );
$$;

create or replace function private.household_role(p_household_id uuid)
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
    and m.status = 'active'
    and private.aal_ok();
$$;

create or replace function private.has_household_permission(
  p_household_id uuid,
  p_permission public.household_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aal_ok() and exists (
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

create or replace function private.shares_household_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aal_ok() and exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.profile_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.profile_id = p_profile_id
      and theirs.status in ('active', 'invited')
  );
$$;

-- Your own profile and account details need the second step too.
drop policy "profiles: read self and household co-members" on public.profiles;
create policy "profiles: read self and household co-members"
  on public.profiles for select to authenticated
  using ((id = (select auth.uid()) and private.aal_ok()) or private.shares_household_with(id));

drop policy "profiles: adults update themselves" on public.profiles;
create policy "profiles: adults update themselves"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and account_type = 'standard' and private.aal_ok())
  with check (id = (select auth.uid()) and account_type = 'standard' and private.aal_ok());

drop policy "account_details: owner reads" on public.account_details;
create policy "account_details: owner reads"
  on public.account_details for select to authenticated
  using (profile_id = (select auth.uid()) and private.aal_ok());

drop policy "account_details: owner updates" on public.account_details;
create policy "account_details: owner updates"
  on public.account_details for update to authenticated
  using (profile_id = (select auth.uid()) and private.aal_ok())
  with check (profile_id = (select auth.uid()) and private.aal_ok());


-- ── 2. Handing a household over ─────────────────────────────────────────────
-- The owner makes another adult member the owner and becomes an admin.

create function public.transfer_household_ownership(p_household_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null or private.household_role(p_household_id) is distinct from 'owner' then
    raise exception 'Only the owner can hand over the household.' using errcode = '42501';
  end if;

  if p_new_owner_id is null
     or p_new_owner_id = v_caller
     or not exists (
       select 1
       from public.household_members m
       join public.profiles p on p.id = m.profile_id
       where m.household_id = p_household_id
         and m.profile_id = p_new_owner_id
         and m.status = 'active'
         and p.account_type = 'standard'
     ) then
    raise exception 'The new owner must be an adult member of this household.'
      using errcode = '22023';
  end if;

  -- One owner at a time: step down first, then hand over.
  update public.household_members
  set role = 'admin'
  where household_id = p_household_id and profile_id = v_caller;

  update public.household_members
  set role = 'owner', revoked_permissions = '{}'
  where household_id = p_household_id and profile_id = p_new_owner_id;
end;
$$;

revoke all on function public.transfer_household_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated;


-- ── 3. Deleting your own account ────────────────────────────────────────────
-- The API deletes the login itself (secret key, approved 2026-10-01) after
-- prepare_account_deletion() has cleared the way.

-- Households you own that still have other people in them (children
-- included): hand them over or delete them first.
create function public.account_deletion_blockers()
returns table (household_id uuid, household_name text, other_members bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, count(other.profile_id)
  from public.household_members mine
  join public.households h on h.id = mine.household_id
  join public.household_members other
    on other.household_id = mine.household_id and other.profile_id <> mine.profile_id
  where mine.profile_id = (select auth.uid())
    and mine.role = 'owner'
    and private.aal_ok()
  group by h.id, h.name;
$$;

create function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null
     or not private.aal_ok()
     or not exists (
       select 1 from public.profiles p where p.id = v_caller and p.account_type = 'standard'
     ) then
    raise exception 'You can''t delete this account.' using errcode = '42501';
  end if;

  if exists (select 1 from public.account_deletion_blockers()) then
    raise exception 'Hand over or delete the households you own first.' using errcode = '55000';
  end if;

  -- Households you own alone go with you.
  delete from public.households h
  where exists (
    select 1 from public.household_members m
    where m.household_id = h.id and m.profile_id = v_caller and m.role = 'owner'
  );

  -- So do your private lists, wherever they are.
  delete from public.lists l where l.created_by = v_caller and l.visibility = 'private';
end;
$$;

revoke all on function public.account_deletion_blockers() from public, anon;
revoke all on function public.prepare_account_deletion() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
