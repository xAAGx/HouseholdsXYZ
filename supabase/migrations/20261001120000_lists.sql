-- ============================================================================
-- Households.xyz: lists (to-dos, shopping, packing): the first content type
-- ============================================================================
-- Every list has an audience, and never one wider than the household:
--   household         every member
--   selected_members  the creator and the members they choose
--   private           only the creator. Children included: a child's private
--                     list is hidden from their parents too (decided with the
--                     project owner, 2026-10-01).
-- Guests can read household lists but not change them (no create_posts).
-- Items can be added, checked and edited by anyone who can see the list and
-- has create_posts. Only a list's creator changes who can see it.
-- ============================================================================


-- ── 1. Tables ───────────────────────────────────────────────────────────────

create type public.list_kind as enum ('todo', 'shopping', 'packing', 'other');

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  kind public.list_kind not null default 'todo',
  visibility public.content_visibility not null default 'household'
    check (visibility in ('private', 'selected_members', 'household')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index lists_household_idx on public.lists (household_id, created_at desc);
create index lists_created_by_idx on public.lists (created_by);

-- Who can see a 'selected_members' list (the creator always can).
create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (list_id, profile_id)
);

create index list_members_profile_idx on public.list_members (profile_id);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  -- Copied from the list by a trigger; the composite key keeps them in step.
  household_id uuid not null,
  text text not null check (char_length(btrim(text)) between 1 and 200),
  note text check (char_length(note) <= 500),
  quantity text check (char_length(quantity) <= 40),
  assigned_to uuid references public.profiles (id) on delete set null,
  due_on date,
  position integer not null,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (list_id, household_id) references public.lists (id, household_id) on delete cascade
);

create index list_items_list_idx on public.list_items (list_id, position);
create index list_items_household_idx on public.list_items (household_id);
create index list_items_assigned_to_idx on public.list_items (assigned_to);
create index list_items_done_by_idx on public.list_items (done_by);
create index list_items_created_by_idx on public.list_items (created_by);

create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function private.set_updated_at();

create trigger list_items_set_updated_at
  before update on public.list_items
  for each row execute function private.set_updated_at();

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_items enable row level security;
revoke all on public.lists, public.list_members, public.list_items from anon, authenticated;


-- ── 2. Who can see a list ───────────────────────────────────────────────────
-- SECURITY DEFINER so the lists and list_members policies can refer to each
-- other without recursing.

create function private.is_list_member(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.list_members lm
    where lm.list_id = p_list_id and lm.profile_id = (select auth.uid())
  );
$$;

create function private.can_see_list(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lists l
    where l.id = p_list_id
      and private.is_household_member(l.household_id)
      and (
        l.visibility = 'household'
        or l.created_by = (select auth.uid())
        or (l.visibility = 'selected_members' and private.is_list_member(l.id))
      )
  );
$$;

-- The same question for someone else (e.g. before assigning them an item).
create function private.profile_can_see_list(p_profile_id uuid, p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lists l
    join public.household_members m
      on m.household_id = l.household_id and m.profile_id = p_profile_id and m.status = 'active'
    where l.id = p_list_id
      and (
        l.visibility = 'household'
        or l.created_by = p_profile_id
        or (
          l.visibility = 'selected_members'
          and exists (
            select 1 from public.list_members lm
            where lm.list_id = l.id and lm.profile_id = p_profile_id
          )
        )
      )
  );
$$;

revoke all on function private.is_list_member(uuid) from public, anon;
revoke all on function private.can_see_list(uuid) from public, anon;
revoke all on function private.profile_can_see_list(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_list_member(uuid) to authenticated;
grant execute on function private.can_see_list(uuid) to authenticated;


-- ── 3. Guards ───────────────────────────────────────────────────────────────

create function private.guard_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the creator decides who can see a list. (This function runs as its
  -- owner, so end-user requests are recognised by having a user id.)
  if tg_op = 'UPDATE'
     and new.visibility is distinct from old.visibility
     and (select auth.uid()) is not null
     and old.created_by is distinct from (select auth.uid()) then
    raise exception 'Only the list''s creator can change who sees it.' using errcode = '42501';
  end if;

  -- Abuse guard.
  if tg_op = 'INSERT'
     and (select count(*) from public.lists l where l.household_id = new.household_id) >= 300 then
    raise exception 'List limit reached.' using errcode = '54000';
  end if;

  -- A list that stops being shared with selected members forgets who they were.
  if tg_op = 'UPDATE'
     and old.visibility = 'selected_members'
     and new.visibility <> 'selected_members' then
    delete from public.list_members lm where lm.list_id = new.id;
  end if;

  return new;
end;
$$;

create trigger lists_guard
  before insert or update on public.lists
  for each row execute function private.guard_list();

create function private.guard_list_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.lists;
begin
  -- The checks below are for people's own requests. Changes the database makes
  -- itself (cleanup triggers, ON DELETE SET NULL) run nested and skip them.
  if pg_trigger_depth() = 1 then
    -- Same answer for "doesn't exist" and "not yours to see".
    if (select auth.uid()) is not null and not private.can_see_list(new.list_id) then
      raise exception 'You can''t change this list.' using errcode = '42501';
    end if;

    select * into v_list from public.lists l where l.id = new.list_id;
    if not found then
      raise exception 'That list doesn''t exist.' using errcode = '23503';
    end if;

    if v_list.archived_at is not null then
      raise exception 'This list is archived. Restore it to change it.' using errcode = '22023';
    end if;

    if new.assigned_to is not null
       and new.assigned_to is distinct from (case when tg_op = 'UPDATE' then old.assigned_to end)
       and not private.profile_can_see_list(new.assigned_to, new.list_id) then
      raise exception 'You can only assign items to people who can see this list.'
        using errcode = '22023';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select l.household_id into new.household_id from public.lists l where l.id = new.list_id;
    if (select count(*) from public.list_items i where i.list_id = new.list_id) >= 500 then
      raise exception 'This list is full.' using errcode = '54000';
    end if;
    select coalesce(max(i.position), 0) + 1 into new.position
    from public.list_items i where i.list_id = new.list_id;
    new.done_by := case when new.done_at is not null then (select auth.uid()) end;
  elsif new.done_at is distinct from old.done_at then
    -- Who ticked it off, and when, is recorded by the database, not the client.
    new.done_by := case when new.done_at is not null then (select auth.uid()) end;
    if new.done_at is not null then
      new.done_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger list_items_guard
  before insert or update on public.list_items
  for each row execute function private.guard_list_item();

-- Someone leaving a household takes their private lists with them and drops
-- out of shared ones. Skipped when the whole household is being deleted.
create function private.cleanup_departed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;

  delete from public.lists l
  where l.household_id = old.household_id
    and l.created_by = old.profile_id
    and l.visibility = 'private';

  delete from public.list_members lm
  using public.lists l
  where lm.list_id = l.id and l.household_id = old.household_id and lm.profile_id = old.profile_id;

  update public.list_items i
  set assigned_to = null
  where i.household_id = old.household_id and i.assigned_to = old.profile_id;

  return old;
end;
$$;

create trigger household_members_cleanup
  after delete on public.household_members
  for each row execute function private.cleanup_departed_member();

revoke all on function private.guard_list() from public, anon, authenticated;
revoke all on function private.guard_list_item() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member() from public, anon, authenticated;


-- ── 4. Policies & grants ────────────────────────────────────────────────────

-- lists
create policy "lists: members see the lists shared with them"
  on public.lists for select to authenticated
  using (
    private.is_household_member(household_id)
    and (
      visibility = 'household'
      or created_by = (select auth.uid())
      or (visibility = 'selected_members' and private.is_list_member(id))
    )
  );

create policy "lists: members with create_posts create lists"
  on public.lists for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and archived_at is null
    and private.has_household_permission(household_id, 'create_posts')
  );

-- Creators edit their lists; moderators can also rename, archive or delete
-- household lists (never private or selected-member ones they can't see).
create policy "lists: creators, or moderators for household lists, edit"
  on public.lists for update to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'moderate_content'))
    )
  )
  with check (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'moderate_content'))
    )
  );

create policy "lists: creators, or moderators for household lists, delete"
  on public.lists for delete to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'moderate_content'))
    )
  );

grant select on public.lists to authenticated;
grant insert (household_id, title, kind, visibility) on public.lists to authenticated;
grant update (title, kind, visibility, archived_at) on public.lists to authenticated;
grant delete on public.lists to authenticated;

-- list_members: who else is on a selected-members list. Written only by
-- set_list_members().
create policy "list_members: visible to people who can see the list"
  on public.list_members for select to authenticated
  using (private.can_see_list(list_id));

grant select on public.list_members to authenticated;

-- list_items
create policy "list_items: visible with the list"
  on public.list_items for select to authenticated
  using (private.can_see_list(list_id));

create policy "list_items: added by people who can see the list and post"
  on public.list_items for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_see_list(list_id)
    and private.has_household_permission(household_id, 'create_posts')
  );

create policy "list_items: changed by people who can see the list and post"
  on public.list_items for update to authenticated
  using (
    private.can_see_list(list_id)
    and private.has_household_permission(household_id, 'create_posts')
  )
  with check (
    private.can_see_list(list_id)
    and private.has_household_permission(household_id, 'create_posts')
  );

create policy "list_items: removed by people who can see the list and post"
  on public.list_items for delete to authenticated
  using (
    private.can_see_list(list_id)
    and private.has_household_permission(household_id, 'create_posts')
  );

grant select on public.list_items to authenticated;
-- household_id and position are accepted but always overwritten by
-- private.guard_list_item() (the list's household; the end of the list).
grant insert (list_id, household_id, position, text, note, quantity, assigned_to, due_on, done_at)
  on public.list_items to authenticated;
grant update (text, note, quantity, assigned_to, due_on, done_at)
  on public.list_items to authenticated;
grant delete on public.list_items to authenticated;


-- ── 5. RPCs ─────────────────────────────────────────────────────────────────

-- Replaces who a selected-members list is shared with. Creator only; everyone
-- chosen must be an active member of the household.
create function public.set_list_members(p_list_id uuid, p_profile_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_list public.lists;
  v_ids uuid[] := coalesce(p_profile_ids, '{}');
begin
  select * into v_list from public.lists l where l.id = p_list_id;
  if not found
     or v_caller is null
     or v_list.created_by is distinct from v_caller
     or not private.is_household_member(v_list.household_id) then
    raise exception 'Only the list''s creator can choose who sees it.' using errcode = '42501';
  end if;

  if cardinality(v_ids) > 100 then
    raise exception 'Too many people.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_ids) as chosen (profile_id)
    where not exists (
      select 1 from public.household_members m
      where m.household_id = v_list.household_id
        and m.profile_id = chosen.profile_id
        and m.status = 'active'
    )
  ) then
    raise exception 'You can only share with members of this household.' using errcode = '22023';
  end if;

  delete from public.list_members lm where lm.list_id = p_list_id;
  insert into public.list_members (list_id, profile_id)
  select distinct p_list_id, chosen.profile_id
  from unnest(v_ids) as chosen (profile_id)
  where chosen.profile_id <> v_caller;
end;
$$;

-- Puts a list's items in the given order (ids not in the list are ignored).
create function public.reorder_list_items(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select l.household_id into v_household from public.lists l where l.id = p_list_id;
  if v_household is null
     or not private.can_see_list(p_list_id)
     or not private.has_household_permission(v_household, 'create_posts') then
    raise exception 'You can''t reorder this list.' using errcode = '42501';
  end if;

  if exists (select 1 from public.lists l where l.id = p_list_id and l.archived_at is not null) then
    raise exception 'This list is archived. Restore it to change it.' using errcode = '22023';
  end if;

  update public.list_items i
  set position = ordered.ord
  from unnest(coalesce(p_item_ids, '{}')) with ordinality as ordered (item_id, ord)
  where i.id = ordered.item_id and i.list_id = p_list_id;
end;
$$;

revoke all on function public.set_list_members(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_list_items(uuid, uuid[]) from public, anon;
grant execute on function public.set_list_members(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_list_items(uuid, uuid[]) to authenticated;
