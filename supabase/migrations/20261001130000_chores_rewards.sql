-- ============================================================================
-- Households.xyz: chores, points and rewards
-- ============================================================================
-- - Chores are seen by every member. People with manage_chores create, edit
--   and approve them; anyone a chore is for (or anyone at all, for unassigned
--   chores) can mark it done, children included.
-- - A chore repeats once, daily, weekly or monthly. Each repeat is a "period";
--   a chore can be done once per period.
-- - Points only move through the ledger, and only through the RPCs below:
--   an approved chore adds its points, asking for a reward takes the cost
--   (given back if the request is turned down or cancelled), and managers can
--   add or take points with a note. A balance is the sum of the ledger.
-- ============================================================================


-- ── 1. Types & tables ───────────────────────────────────────────────────────

create type public.chore_repeat as enum ('once', 'daily', 'weekly', 'monthly');
create type public.chore_completion_status as enum ('pending', 'approved', 'rejected');
create type public.redemption_status as enum ('requested', 'approved', 'rejected', 'cancelled');
create type public.points_reason as enum ('chore', 'reward', 'adjustment');

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  notes text check (char_length(notes) <= 500),
  points integer not null default 0 check (points between 0 and 1000),
  -- Null: anyone in the household can do it.
  assigned_to uuid references public.profiles (id) on delete set null,
  repeat public.chore_repeat not null default 'once',
  -- For one-off chores: the day it's due (optional).
  due_on date,
  needs_approval boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index chores_household_idx on public.chores (household_id);
create index chores_assigned_to_idx on public.chores (assigned_to);
create index chores_created_by_idx on public.chores (created_by);

create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null,
  household_id uuid not null,
  -- The repeat this completion counts for (see private.chore_period_start).
  period_start date not null,
  completed_by uuid not null references public.profiles (id) on delete cascade,
  status public.chore_completion_status not null,
  -- The chore's points when it was done, so later edits don't rewrite history.
  points integer not null check (points between 0 and 1000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (chore_id, household_id) references public.chores (id, household_id) on delete cascade
);

-- Once per period. A turned-down completion can be tried again.
create unique index chore_completions_once_per_period
  on public.chore_completions (chore_id, period_start) where status <> 'rejected';
create index chore_completions_household_idx
  on public.chore_completions (household_id, created_at desc);
create index chore_completions_completed_by_idx on public.chore_completions (completed_by);
create index chore_completions_reviewed_by_idx on public.chore_completions (reviewed_by);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (char_length(description) <= 300),
  cost integer not null check (cost between 1 and 100000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index rewards_household_idx on public.rewards (household_id);
create index rewards_created_by_idx on public.rewards (created_by);

create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  -- Rewards that have been asked for are archived, never deleted.
  reward_id uuid not null,
  household_id uuid not null,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  cost integer not null check (cost between 1 and 100000),
  status public.redemption_status not null default 'requested',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (reward_id, household_id) references public.rewards (id, household_id) on delete restrict,
  foreign key (household_id) references public.households (id) on delete cascade
);

create index reward_redemptions_household_idx
  on public.reward_redemptions (household_id, created_at desc);
create index reward_redemptions_reward_idx on public.reward_redemptions (reward_id);
create index reward_redemptions_requested_by_idx on public.reward_redemptions (requested_by);
create index reward_redemptions_reviewed_by_idx on public.reward_redemptions (reviewed_by);

create table public.points_ledger (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0 and delta between -100000 and 100000),
  reason public.points_reason not null,
  note text check (char_length(note) <= 120),
  chore_completion_id uuid references public.chore_completions (id) on delete set null,
  redemption_id uuid references public.reward_redemptions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index points_ledger_member_idx on public.points_ledger (household_id, profile_id);
create index points_ledger_household_idx on public.points_ledger (household_id, created_at desc);
create index points_ledger_profile_idx on public.points_ledger (profile_id);
create index points_ledger_completion_idx on public.points_ledger (chore_completion_id);
create index points_ledger_redemption_idx on public.points_ledger (redemption_id);
create index points_ledger_created_by_idx on public.points_ledger (created_by);

create trigger chores_set_updated_at
  before update on public.chores
  for each row execute function private.set_updated_at();

create trigger rewards_set_updated_at
  before update on public.rewards
  for each row execute function private.set_updated_at();

alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.points_ledger enable row level security;
revoke all on public.chores, public.chore_completions, public.rewards,
  public.reward_redemptions, public.points_ledger from anon, authenticated;


-- ── 2. Periods ──────────────────────────────────────────────────────────────
-- Mirrored in packages/shared/src/chores/periods.ts (tests keep them equal).
-- Weeks start on Monday. A one-off chore has a single period: the day it was
-- created.

create function private.chore_period_start(
  p_repeat public.chore_repeat,
  p_day date,
  p_created_on date
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_repeat
    when 'daily' then p_day
    when 'weekly' then p_day - (extract(isodow from p_day)::integer - 1)
    when 'monthly' then date_trunc('month', p_day)::date
    else p_created_on
  end;
$$;

revoke all on function private.chore_period_start(public.chore_repeat, date, date)
  from public, anon, authenticated;


-- ── 3. Guards ───────────────────────────────────────────────────────────────

create function private.guard_chore()
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

  if tg_op = 'INSERT'
     and (select count(*) from public.chores c where c.household_id = new.household_id) >= 300 then
    raise exception 'Chore limit reached.' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger chores_guard
  before insert or update on public.chores
  for each row execute function private.guard_chore();

create function private.guard_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.rewards r where r.household_id = new.household_id) >= 100 then
    raise exception 'Reward limit reached.' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger rewards_guard
  before insert on public.rewards
  for each row execute function private.guard_reward();

-- Leaving a household also clears the chores that were for you.
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

  return old;
end;
$$;

revoke all on function private.guard_chore() from public, anon, authenticated;
revoke all on function private.guard_reward() from public, anon, authenticated;


-- ── 4. Policies & grants ────────────────────────────────────────────────────

create policy "chores: members see them"
  on public.chores for select to authenticated
  using (private.is_household_member(household_id));

create policy "chores: managers create them"
  on public.chores for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_household_permission(household_id, 'manage_chores')
  );

create policy "chores: managers edit them"
  on public.chores for update to authenticated
  using (private.has_household_permission(household_id, 'manage_chores'))
  with check (private.has_household_permission(household_id, 'manage_chores'));

create policy "chores: managers delete them"
  on public.chores for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_chores'));

grant select on public.chores to authenticated;
grant insert (household_id, title, notes, points, assigned_to, repeat, due_on, needs_approval)
  on public.chores to authenticated;
grant update (title, notes, points, assigned_to, repeat, due_on, needs_approval, archived_at)
  on public.chores to authenticated;
grant delete on public.chores to authenticated;

create policy "chore_completions: members see them"
  on public.chore_completions for select to authenticated
  using (private.is_household_member(household_id));

grant select on public.chore_completions to authenticated;

create policy "rewards: members see them"
  on public.rewards for select to authenticated
  using (private.is_household_member(household_id));

create policy "rewards: managers create them"
  on public.rewards for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_household_permission(household_id, 'manage_chores')
  );

create policy "rewards: managers edit them"
  on public.rewards for update to authenticated
  using (private.has_household_permission(household_id, 'manage_chores'))
  with check (private.has_household_permission(household_id, 'manage_chores'));

create policy "rewards: managers delete them"
  on public.rewards for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_chores'));

grant select on public.rewards to authenticated;
grant insert (household_id, title, description, cost) on public.rewards to authenticated;
grant update (title, description, cost, archived_at) on public.rewards to authenticated;
grant delete on public.rewards to authenticated;

create policy "reward_redemptions: members see them"
  on public.reward_redemptions for select to authenticated
  using (private.is_household_member(household_id));

grant select on public.reward_redemptions to authenticated;

create policy "points_ledger: members see them"
  on public.points_ledger for select to authenticated
  using (private.is_household_member(household_id));

grant select on public.points_ledger to authenticated;


-- ── 5. RPCs ─────────────────────────────────────────────────────────────────

-- Marks a chore done for the period containing p_today (the device's own
-- date, which must be within a day of the server's). Auto-approved when the
-- chore doesn't need approval, or when a manager does it.
create function public.complete_chore(p_chore_id uuid, p_today date)
returns table (completion_id uuid, completion_status public.chore_completion_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_chore public.chores;
  v_status public.chore_completion_status;
  v_id uuid;
begin
  select * into v_chore from public.chores c where c.id = p_chore_id;
  if not found
     or v_caller is null
     or not private.is_household_member(v_chore.household_id)
     or v_chore.archived_at is not null
     or (v_chore.assigned_to is not null and v_chore.assigned_to <> v_caller) then
    raise exception 'You can''t mark this chore as done.' using errcode = '42501';
  end if;

  if p_today is null or abs(p_today - current_date) > 1 then
    raise exception 'Check the date on your device.' using errcode = '22023';
  end if;

  v_status := case
    when not v_chore.needs_approval then 'approved'
    when private.has_household_permission(v_chore.household_id, 'manage_chores') then 'approved'
    else 'pending'
  end;

  insert into public.chore_completions
    (chore_id, household_id, period_start, completed_by, status, points, reviewed_by, reviewed_at)
  values (
    v_chore.id,
    v_chore.household_id,
    private.chore_period_start(v_chore.repeat, p_today, v_chore.created_at::date),
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

-- Approves (points are added) or turns down a completion waiting for approval.
create function public.review_chore_completion(p_completion_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_completion public.chore_completions;
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

  update public.chore_completions
  set status = case when p_approve then 'approved' else 'rejected' end::public.chore_completion_status,
      reviewed_by = v_caller,
      reviewed_at = now()
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

-- Takes a completion back. Whoever did it can undo it while it's waiting;
-- managers can also undo approved ones, which takes the points back.
create function public.undo_chore_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_completion public.chore_completions;
  v_manager boolean;
begin
  select * into v_completion
  from public.chore_completions cc
  where cc.id = p_completion_id
  for update;

  if not found or v_caller is null or not private.is_household_member(v_completion.household_id) then
    raise exception 'You can''t undo this.' using errcode = '42501';
  end if;

  v_manager := private.has_household_permission(v_completion.household_id, 'manage_chores');

  if v_completion.status = 'pending' and (v_completion.completed_by = v_caller or v_manager) then
    delete from public.chore_completions where id = p_completion_id;
  elsif v_completion.status = 'approved' and v_manager then
    if v_completion.points > 0 then
      insert into public.points_ledger
        (household_id, profile_id, delta, reason, note, created_by)
      values (
        v_completion.household_id,
        v_completion.completed_by,
        -v_completion.points,
        'chore',
        'Chore undone',
        v_caller
      );
    end if;
    delete from public.chore_completions where id = p_completion_id;
  else
    raise exception 'You can''t undo this.' using errcode = '42501';
  end if;
end;
$$;

-- Asks for a reward: the cost comes off the balance straight away, and comes
-- back if the request is turned down or cancelled.
create function public.request_reward(p_reward_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_reward public.rewards;
  v_balance bigint;
  v_id uuid;
begin
  select * into v_reward from public.rewards r where r.id = p_reward_id;
  if not found
     or v_caller is null
     or v_reward.archived_at is not null
     or not private.is_household_member(v_reward.household_id) then
    raise exception 'You can''t ask for this reward.' using errcode = '42501';
  end if;

  -- One request at a time per person, so two can't spend the same points.
  perform pg_advisory_xact_lock(hashtext(v_reward.household_id::text || v_caller::text));

  select coalesce(sum(pl.delta), 0) into v_balance
  from public.points_ledger pl
  where pl.household_id = v_reward.household_id and pl.profile_id = v_caller;

  if v_balance < v_reward.cost then
    raise exception 'Not enough points yet.' using errcode = '22023';
  end if;

  insert into public.reward_redemptions (reward_id, household_id, requested_by, cost)
  values (v_reward.id, v_reward.household_id, v_caller, v_reward.cost)
  returning id into v_id;

  insert into public.points_ledger
    (household_id, profile_id, delta, reason, redemption_id, created_by)
  values (v_reward.household_id, v_caller, -v_reward.cost, 'reward', v_id, v_caller);

  return v_id;
end;
$$;

-- Managers give the reward (approve) or turn the request down (points back).
create function public.review_reward_redemption(p_redemption_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_redemption public.reward_redemptions;
begin
  select * into v_redemption
  from public.reward_redemptions rr
  where rr.id = p_redemption_id
  for update;

  if not found
     or v_caller is null
     or v_redemption.status <> 'requested'
     or p_approve is null
     or not private.has_household_permission(v_redemption.household_id, 'manage_chores') then
    raise exception 'You can''t review this request.' using errcode = '42501';
  end if;

  update public.reward_redemptions
  set status = case when p_approve then 'approved' else 'rejected' end::public.redemption_status,
      reviewed_by = v_caller,
      reviewed_at = now()
  where id = p_redemption_id;

  if not p_approve then
    insert into public.points_ledger
      (household_id, profile_id, delta, reason, note, redemption_id, created_by)
    values (
      v_redemption.household_id,
      v_redemption.requested_by,
      v_redemption.cost,
      'reward',
      'Request turned down',
      p_redemption_id,
      v_caller
    );
  end if;
end;
$$;

-- The person who asked can cancel while it's still waiting (points back).
create function public.cancel_reward_redemption(p_redemption_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_redemption public.reward_redemptions;
begin
  select * into v_redemption
  from public.reward_redemptions rr
  where rr.id = p_redemption_id
  for update;

  if not found
     or v_caller is null
     or v_redemption.status <> 'requested'
     or v_redemption.requested_by <> v_caller
     or not private.is_household_member(v_redemption.household_id) then
    raise exception 'You can''t cancel this request.' using errcode = '42501';
  end if;

  update public.reward_redemptions
  set status = 'cancelled', reviewed_by = v_caller, reviewed_at = now()
  where id = p_redemption_id;

  insert into public.points_ledger
    (household_id, profile_id, delta, reason, note, redemption_id, created_by)
  values (
    v_redemption.household_id,
    v_caller,
    v_redemption.cost,
    'reward',
    'Request cancelled',
    p_redemption_id,
    v_caller
  );
end;
$$;

-- Managers add or take points, with a reason. Never for themselves.
create function public.adjust_points(
  p_household_id uuid,
  p_profile_id uuid,
  p_delta integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
begin
  if v_caller is null
     or p_profile_id = v_caller
     or not private.has_household_permission(p_household_id, 'manage_chores')
     or not exists (
       select 1 from public.household_members m
       where m.household_id = p_household_id and m.profile_id = p_profile_id and m.status = 'active'
     ) then
    raise exception 'You can''t change this person''s points.' using errcode = '42501';
  end if;

  if p_delta is null or p_delta = 0 or p_delta not between -10000 and 10000 then
    raise exception 'Give or take between 1 and 10,000 points.' using errcode = '22023';
  end if;

  if v_note is null or char_length(v_note) > 120 then
    raise exception 'Say why, in up to 120 characters.' using errcode = '22023';
  end if;

  insert into public.points_ledger (household_id, profile_id, delta, reason, note, created_by)
  values (p_household_id, p_profile_id, p_delta, 'adjustment', v_note, v_caller);
end;
$$;

-- Everyone's balance in a household (members only, through RLS).
create function public.household_points(p_household_id uuid)
returns table (profile_id uuid, balance bigint)
language sql
stable
set search_path = ''
as $$
  select pl.profile_id, sum(pl.delta)::bigint
  from public.points_ledger pl
  where pl.household_id = p_household_id
  group by pl.profile_id;
$$;

revoke all on function public.complete_chore(uuid, date) from public, anon;
revoke all on function public.review_chore_completion(uuid, boolean) from public, anon;
revoke all on function public.undo_chore_completion(uuid) from public, anon;
revoke all on function public.request_reward(uuid) from public, anon;
revoke all on function public.review_reward_redemption(uuid, boolean) from public, anon;
revoke all on function public.cancel_reward_redemption(uuid) from public, anon;
revoke all on function public.adjust_points(uuid, uuid, integer, text) from public, anon;
revoke all on function public.household_points(uuid) from public, anon;
grant execute on function public.complete_chore(uuid, date) to authenticated;
grant execute on function public.review_chore_completion(uuid, boolean) to authenticated;
grant execute on function public.undo_chore_completion(uuid) to authenticated;
grant execute on function public.request_reward(uuid) to authenticated;
grant execute on function public.review_reward_redemption(uuid, boolean) to authenticated;
grant execute on function public.cancel_reward_redemption(uuid) to authenticated;
grant execute on function public.adjust_points(uuid, uuid, integer, text) to authenticated;
grant execute on function public.household_points(uuid) to authenticated;
