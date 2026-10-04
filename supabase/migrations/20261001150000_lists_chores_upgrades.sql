-- ============================================================================
-- Households.xyz: richer lists and chores
-- ============================================================================
-- - Fix: "needs approval" now always waits for approval, whoever does the
--   chore, and nobody approves their own. (Before, anyone who manages chores
--   was approved instantly, which in practice skipped approval for adults.)
-- - Turning a chore down can say why (shown to the person who did it).
-- - Chores can be on chosen weekdays, take turns between people, and belong
--   to a time of day (morning, afternoon, evening routines).
-- - List items get a store section (category) for shopping lists.
-- ============================================================================


-- ── 1. Lists: store sections ────────────────────────────────────────────────

alter table public.list_items
  add column category text check (char_length(btrim(category)) between 1 and 40);

grant insert (category) on public.list_items to authenticated;
grant update (category) on public.list_items to authenticated;


-- ── 2. Chores: days, turns, routines ────────────────────────────────────────

create type public.chore_time_of_day as enum ('anytime', 'morning', 'afternoon', 'evening');

alter table public.chores
  add column time_of_day public.chore_time_of_day not null default 'anytime',
  -- Daily chores only: ISO weekdays it's on (1 = Monday … 7 = Sunday). Null: every day.
  add column weekdays smallint[]
    check (
      weekdays is null
      or (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(weekdays) between 1 and 7)
    ),
  -- People who take turns, in order: one per period. Null: no turns.
  add column rotation uuid[]
    check (rotation is null or cardinality(rotation) between 2 and 20);

grant insert (time_of_day, weekdays, rotation) on public.chores to authenticated;
grant update (time_of_day, weekdays, rotation) on public.chores to authenticated;

alter table public.chore_completions
  add column review_note text check (char_length(review_note) <= 200);

-- Which repeat this is, counting from a fixed Monday, so turns rotate evenly.
-- Mirrored in packages/shared/src/chores/periods.ts (tests keep them equal).
create function private.chore_period_index(p_repeat public.chore_repeat, p_period_start date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_repeat
    when 'daily' then p_period_start - date '2000-01-03'
    when 'weekly' then (p_period_start - date '2000-01-03') / 7
    when 'monthly' then
      (extract(year from p_period_start)::integer - 2000) * 12
        + extract(month from p_period_start)::integer - 1
    else 0
  end;
$$;

-- Whose turn it is in a period (null: anyone, or no rotation and no assignee).
create function private.chore_assignee(p_chore public.chores, p_period_start date)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(cardinality(p_chore.rotation), 0) > 0 then
      p_chore.rotation[
        (
          (private.chore_period_index(p_chore.repeat, p_period_start) % cardinality(p_chore.rotation))
          + cardinality(p_chore.rotation)
        ) % cardinality(p_chore.rotation) + 1
      ]
    else p_chore.assigned_to
  end;
$$;

revoke all on function private.chore_period_index(public.chore_repeat, date)
  from public, anon, authenticated;
revoke all on function private.chore_assignee(public.chores, date)
  from public, anon, authenticated;

create or replace function private.guard_chore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from (case when tg_op = 'UPDATE' then old.assigned_to end)
     and not exists (
       select 1 from public.household_members m
       where m.household_id = new.household_id
         and m.profile_id = new.assigned_to
         and m.status = 'active'
     ) then
    raise exception 'Chores can only be for members of this household.' using errcode = '22023';
  end if;

  if new.rotation is not null then
    if (select count(distinct r) from unnest(new.rotation) as r) <> cardinality(new.rotation) then
      raise exception 'Each person takes one turn in the rotation.' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(new.rotation) as r (profile_id)
      where not exists (
        select 1 from public.household_members m
        where m.household_id = new.household_id
          and m.profile_id = r.profile_id
          and m.status = 'active'
      )
    ) then
      raise exception 'Chores can only be for members of this household.' using errcode = '22023';
    end if;
    -- Turns replace a fixed assignee.
    new.assigned_to := null;
  end if;

  -- Weekdays only mean something for daily chores.
  if new.repeat <> 'daily' then
    new.weekdays := null;
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.chores c where c.household_id = new.household_id) >= 300 then
    raise exception 'Chore limit reached.' using errcode = '54000';
  end if;
  return new;
end;
$$;

-- Leaving a household also takes you out of chore rotations. A rotation left
-- with one person becomes a chore for that person.
create or replace function private.cleanup_departed_member()
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

  update public.chores c
  set assigned_to = null
  where c.household_id = old.household_id and c.assigned_to = old.profile_id;

  update public.chores c
  set assigned_to = case when cardinality(array_remove(c.rotation, old.profile_id)) = 1
                         then (array_remove(c.rotation, old.profile_id))[1] end,
      rotation = case when cardinality(array_remove(c.rotation, old.profile_id)) >= 2
                      then array_remove(c.rotation, old.profile_id) end
  where c.household_id = old.household_id and old.profile_id = any (c.rotation);

  return old;
end;
$$;


-- ── 3. Completing and reviewing chores ──────────────────────────────────────

create or replace function public.complete_chore(p_chore_id uuid, p_today date)
returns table (completion_id uuid, completion_status public.chore_completion_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_chore public.chores;
  v_period date;
  v_assignee uuid;
  v_status public.chore_completion_status;
  v_id uuid;
begin
  select * into v_chore from public.chores c where c.id = p_chore_id;
  if not found
     or v_caller is null
     or not private.is_household_member(v_chore.household_id)
     or v_chore.archived_at is not null then
    raise exception 'You can''t mark this chore as done.' using errcode = '42501';
  end if;

  if p_today is null or abs(p_today - current_date) > 1 then
    raise exception 'Check the date on your device.' using errcode = '22023';
  end if;

  if v_chore.repeat = 'daily'
     and v_chore.weekdays is not null
     and not (extract(isodow from p_today)::smallint = any (v_chore.weekdays)) then
    raise exception 'This chore isn''t on today.' using errcode = '22023';
  end if;

  v_period := private.chore_period_start(v_chore.repeat, p_today, v_chore.created_at::date);
  v_assignee := private.chore_assignee(v_chore, v_period);
  if v_assignee is not null and v_assignee <> v_caller then
    raise exception 'It''s someone else''s turn.' using errcode = '42501';
  end if;

  -- Approval applies to everyone, managers included.
  v_status := case when v_chore.needs_approval then 'pending' else 'approved' end;

  insert into public.chore_completions
    (chore_id, household_id, period_start, completed_by, status, points, reviewed_by, reviewed_at)
  values (
    v_chore.id,
    v_chore.household_id,
    v_period,
    v_caller,
    v_status,
    v_chore.points,
    case when v_status = 'approved' then v_caller end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_id;

  if v_status = 'approved' and v_chore.points > 0 then
    insert into public.points_ledger
      (household_id, profile_id, delta, reason, chore_completion_id, created_by)
    values (v_chore.household_id, v_caller, v_chore.points, 'chore', v_id, v_caller);
  end if;

  return query select v_id, v_status;
end;
$$;

drop function public.review_chore_completion(uuid, boolean);

-- Approves (points are added) or turns down a completion, optionally saying
-- why. Never your own.
create function public.review_chore_completion(
  p_completion_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_completion public.chore_completions;
  v_note text := nullif(btrim(p_note), '');
begin
  select * into v_completion
  from public.chore_completions cc
  where cc.id = p_completion_id
  for update;

  if not found
     or v_caller is null
     or v_completion.status <> 'pending'
     or p_approve is null
     or not private.has_household_permission(v_completion.household_id, 'manage_chores') then
    raise exception 'You can''t review this chore.' using errcode = '42501';
  end if;

  if v_completion.completed_by = v_caller then
    raise exception 'Someone else needs to approve your own chores.' using errcode = '42501';
  end if;

  if char_length(v_note) > 200 then
    raise exception 'Keep the note to 200 characters.' using errcode = '22023';
  end if;

  update public.chore_completions
  set status = case when p_approve then 'approved' else 'rejected' end::public.chore_completion_status,
      reviewed_by = v_caller,
      reviewed_at = now(),
      review_note = v_note
  where id = p_completion_id;

  if p_approve and v_completion.points > 0 then
    insert into public.points_ledger
      (household_id, profile_id, delta, reason, chore_completion_id, created_by)
    values (
      v_completion.household_id,
      v_completion.completed_by,
      v_completion.points,
      'chore',
      p_completion_id,
      v_caller
    );
  end if;
end;
$$;

revoke all on function public.review_chore_completion(uuid, boolean, text) from public, anon;
grant execute on function public.review_chore_completion(uuid, boolean, text) to authenticated;
