-- ============================================================================
-- Households.xyz: money: shared expenses, budgets, bills and pocket money
-- ============================================================================
-- Expenses, settle-ups, budgets and bills are for the grown-ups who can see
-- money: view_expenses to read, manage_expenses to change (adults and admins
-- by default; never children, caregivers or guests).
-- Pocket money is each child's own record: they see their own, people who
-- manage expenses see and change everyone's, and nobody changes their own.
-- Points can become pocket money at a rate the household sets.
-- No real money moves anywhere: these are records. Amounts are whole minor
-- units (cents) of the household's currency.
-- ============================================================================


-- ── 1. Settings ─────────────────────────────────────────────────────────────

alter table public.households
  add column currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column currency_digits smallint not null default 2 check (currency_digits between 0 and 3),
  -- What 100 chore points are worth in pocket money (minor units); null: points stay points.
  add column points_value_minor integer check (points_value_minor between 1 and 1000000);

grant update (currency, currency_digits, points_value_minor) on public.households to authenticated;

alter type public.notification_kind add value if not exists 'bill_due';
alter type public.notification_kind add value if not exists 'allowance_paid';
alter type public.notification_kind add value if not exists 'pocket_money';

-- "12.50 USD", for notifications.
create function private.money_text(p_household_id uuid, p_amount bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select trim(to_char(p_amount / power(10, h.currency_digits)::numeric,
                      'FM999999999990' || case when h.currency_digits > 0
                                               then '.' || repeat('0', h.currency_digits) else '' end))
         || ' ' || h.currency
  from public.households h where h.id = p_household_id;
$$;

revoke all on function private.money_text(uuid, bigint) from public, anon, authenticated;

-- Members who have a permission (for telling the right people about money).
create function private.members_with(p_household_id uuid, p_permission public.household_permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id from public.household_members m
  where m.household_id = p_household_id
    and m.status = 'active'
    and private.member_has_permission(m.profile_id, p_household_id, p_permission);
$$;

revoke all on function private.members_with(uuid, public.household_permission)
  from public, anon, authenticated;

-- Live updates for money go only to the people who may see it.
create function private.broadcast_to_permission(
  p_household_id uuid,
  p_permission public.household_permission,
  p_scope text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select private.members_with(p_household_id, p_permission) loop
    perform private.broadcast('profile:' || v_id, p_scope);
  end loop;
end;
$$;

revoke all on function private.broadcast_to_permission(uuid, public.household_permission, text)
  from public, anon, authenticated;


-- ── 2. Shared expenses, settle-ups, budgets, bills ──────────────────────────

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  -- Null when it varies (the electricity bill).
  amount_minor bigint check (amount_minor between 1 and 100000000000),
  category text not null default 'Bills' check (char_length(btrim(category)) between 1 and 40),
  repeat text not null default 'monthly' check (repeat in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_due date not null,
  -- Days before it's due to remind (0: on the day).
  remind_days smallint not null default 3 check (remind_days between 0 and 30),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  spent_on date not null default current_date,
  category text not null default 'Other' check (char_length(btrim(category)) between 1 and 40),
  paid_by uuid references public.profiles (id) on delete set null,
  -- Shared equally between these people (empty: a household cost, not split).
  split_between uuid[] not null default '{}' check (cardinality(split_between) <= 20),
  notes text check (char_length(notes) <= 300),
  bill_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bill_id, household_id) references public.bills (id, household_id) on delete set null (bill_id)
);

create index expenses_household_idx on public.expenses (household_id, spent_on desc);
create index expenses_paid_by_idx on public.expenses (paid_by);
create index expenses_bill_idx on public.expenses (bill_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index bills_household_idx on public.bills (household_id, next_due);
create index bills_created_by_idx on public.bills (created_by);

-- "Sam paid Maya back 40.00".
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_id uuid references public.profiles (id) on delete set null,
  to_id uuid references public.profiles (id) on delete set null,
  amount_minor bigint not null check (amount_minor between 1 and 100000000000),
  settled_on date not null default current_date,
  note text check (char_length(note) <= 120),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_id is distinct from to_id)
);

create index settlements_household_idx on public.settlements (household_id, settled_on desc);
create index settlements_from_idx on public.settlements (from_id);
create index settlements_to_idx on public.settlements (to_id);
create index settlements_created_by_idx on public.settlements (created_by);

-- A monthly budget for a category ("Groceries: 600.00").
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category text not null check (char_length(btrim(category)) between 1 and 40),
  monthly_minor bigint not null check (monthly_minor between 1 and 100000000000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index budgets_category_idx on public.budgets (household_id, lower(btrim(category)));
create index budgets_created_by_idx on public.budgets (created_by);

create trigger bills_set_updated_at before update on public.bills
  for each row execute function private.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();
create trigger budgets_set_updated_at before update on public.budgets
  for each row execute function private.set_updated_at();

alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.budgets enable row level security;
revoke all on public.bills, public.expenses, public.settlements, public.budgets
  from anon, authenticated;

-- People named on money records are active members; abuse caps.
create function private.guard_money()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_people uuid[];
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_table_name = 'expenses' then
    if (select count(distinct s) from unnest(new.split_between) s) <> cardinality(new.split_between) then
      raise exception 'Choose each person once.' using errcode = '22023';
    end if;
    v_people := array_append(new.split_between, new.paid_by);
    if tg_op = 'INSERT'
       and (select count(*) from public.expenses e where e.household_id = new.household_id) >= 50000 then
      raise exception 'Expense limit reached.' using errcode = '54000';
    end if;
  elsif tg_table_name = 'settlements' then
    v_people := array[new.from_id, new.to_id];
  end if;
  if exists (
    select 1 from unnest(v_people) p
    where p is not null and not exists (
      select 1 from public.household_members m
      where m.household_id = new.household_id and m.profile_id = p and m.status = 'active'
    )
  ) then
    raise exception 'Only members of this household can be on it.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_money() from public, anon, authenticated;

create trigger expenses_guard before insert or update on public.expenses
  for each row execute function private.guard_money();
create trigger settlements_guard before insert or update on public.settlements
  for each row execute function private.guard_money();

-- Reading needs view_expenses; changing needs manage_expenses.
create policy "bills: people who see money" on public.bills for select to authenticated
  using (private.has_household_permission(household_id, 'view_expenses'));
create policy "bills: people who manage money add" on public.bills for insert to authenticated
  with check (created_by = (select auth.uid())
              and private.has_household_permission(household_id, 'manage_expenses'));
create policy "bills: people who manage money change" on public.bills for update to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'))
  with check (private.has_household_permission(household_id, 'manage_expenses'));
create policy "bills: people who manage money delete" on public.bills for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'));

create policy "expenses: people who see money" on public.expenses for select to authenticated
  using (private.has_household_permission(household_id, 'view_expenses'));
create policy "expenses: people who manage money add" on public.expenses for insert to authenticated
  with check (created_by = (select auth.uid())
              and private.has_household_permission(household_id, 'manage_expenses'));
create policy "expenses: people who manage money change" on public.expenses for update to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'))
  with check (private.has_household_permission(household_id, 'manage_expenses'));
create policy "expenses: people who manage money delete" on public.expenses for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'));

create policy "settlements: people who see money" on public.settlements for select to authenticated
  using (private.has_household_permission(household_id, 'view_expenses'));
create policy "settlements: people who manage money add" on public.settlements for insert to authenticated
  with check (created_by = (select auth.uid())
              and private.has_household_permission(household_id, 'manage_expenses'));
create policy "settlements: people who manage money delete" on public.settlements for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'));

create policy "budgets: people who see money" on public.budgets for select to authenticated
  using (private.has_household_permission(household_id, 'view_expenses'));
create policy "budgets: people who manage money add" on public.budgets for insert to authenticated
  with check (created_by = (select auth.uid())
              and private.has_household_permission(household_id, 'manage_expenses'));
create policy "budgets: people who manage money change" on public.budgets for update to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'))
  with check (private.has_household_permission(household_id, 'manage_expenses'));
create policy "budgets: people who manage money delete" on public.budgets for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'));

grant select on public.bills, public.expenses, public.settlements, public.budgets to authenticated;
grant insert (household_id, title, amount_minor, category, repeat, next_due, remind_days)
  on public.bills to authenticated;
grant update (title, amount_minor, category, repeat, next_due, remind_days, archived_at)
  on public.bills to authenticated;
grant insert (household_id, title, amount_minor, spent_on, category, paid_by, split_between, notes, bill_id)
  on public.expenses to authenticated;
grant update (title, amount_minor, spent_on, category, paid_by, split_between, notes)
  on public.expenses to authenticated;
grant insert (household_id, from_id, to_id, amount_minor, settled_on, note)
  on public.settlements to authenticated;
grant insert (household_id, category, monthly_minor) on public.budgets to authenticated;
grant update (category, monthly_minor) on public.budgets to authenticated;
grant delete on public.bills, public.expenses, public.settlements, public.budgets to authenticated;

-- The next due date after `p_due` for a repeat (months keep the day, or the
-- month's last day when it's shorter).
create function private.next_bill_due(p_due date, p_repeat text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_repeat
    when 'weekly' then p_due + 7
    when 'monthly' then (p_due + interval '1 month')::date
    when 'quarterly' then (p_due + interval '3 months')::date
    else (p_due + interval '1 year')::date
  end;
$$;

-- Marks a bill paid: records the expense and moves the bill to its next date.
create function public.pay_bill(
  p_bill_id uuid,
  p_amount_minor bigint,
  p_paid_by uuid,
  p_split_between uuid[],
  p_paid_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_bill public.bills;
  v_expense uuid;
begin
  select * into v_bill from public.bills b where b.id = p_bill_id for update;
  if not found
     or v_caller is null
     or v_bill.archived_at is not null
     or not private.has_household_permission(v_bill.household_id, 'manage_expenses') then
    raise exception 'You can''t mark this bill paid.' using errcode = '42501';
  end if;

  insert into public.expenses
    (household_id, title, amount_minor, spent_on, category, paid_by, split_between, bill_id, created_by)
  values (
    v_bill.household_id,
    v_bill.title,
    coalesce(p_amount_minor, v_bill.amount_minor),
    coalesce(p_paid_on, current_date),
    v_bill.category,
    coalesce(p_paid_by, v_caller),
    coalesce(p_split_between, '{}'),
    v_bill.id,
    v_caller
  )
  returning id into v_expense;

  update public.bills
  set next_due = private.next_bill_due(v_bill.next_due, v_bill.repeat)
  where id = v_bill.id;
  return v_expense;
end;
$$;

revoke all on function private.next_bill_due(date, text) from public, anon, authenticated;
revoke all on function public.pay_bill(uuid, bigint, uuid, uuid[], date) from public, anon;
grant execute on function public.pay_bill(uuid, bigint, uuid, uuid[], date) to authenticated;


-- ── 3. Pocket money ─────────────────────────────────────────────────────────

create type public.pocket_kind as enum ('allowance', 'gift', 'spend', 'points', 'adjustment');

create table public.pocket_transactions (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount_minor bigint not null check (amount_minor <> 0 and abs(amount_minor) <= 1000000000),
  kind public.pocket_kind not null,
  note text check (char_length(note) <= 120),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index pocket_transactions_member_idx
  on public.pocket_transactions (household_id, profile_id, created_at desc);
create index pocket_transactions_profile_idx on public.pocket_transactions (profile_id);
create index pocket_transactions_created_by_idx on public.pocket_transactions (created_by);

create table public.pocket_allowances (
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount_minor bigint not null check (amount_minor between 1 and 100000000),
  -- ISO weekday it's paid on (1 = Monday).
  weekday smallint not null default 6 check (weekday between 1 and 7),
  active boolean not null default true,
  last_paid_on date,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

create index pocket_allowances_profile_idx on public.pocket_allowances (profile_id);
create index pocket_allowances_created_by_idx on public.pocket_allowances (created_by);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  target_minor bigint not null check (target_minor between 1 and 1000000000),
  achieved_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index savings_goals_member_idx on public.savings_goals (household_id, profile_id);
create index savings_goals_profile_idx on public.savings_goals (profile_id);
create index savings_goals_created_by_idx on public.savings_goals (created_by);

create trigger pocket_allowances_set_updated_at before update on public.pocket_allowances
  for each row execute function private.set_updated_at();

alter table public.pocket_transactions enable row level security;
alter table public.pocket_allowances enable row level security;
alter table public.savings_goals enable row level security;
revoke all on public.pocket_transactions, public.pocket_allowances, public.savings_goals
  from anon, authenticated;

-- Pocket money is about another active member, never yourself (for managers),
-- and at most 30 goals each.
create function private.guard_pocket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.household_id = new.household_id and m.profile_id = new.profile_id and m.status = 'active'
  ) then
    raise exception 'Only members of this household have pocket money here.' using errcode = '22023';
  end if;
  if tg_table_name = 'pocket_allowances'
     and new.profile_id = (select auth.uid()) then
    raise exception 'Someone else sets up your allowance.' using errcode = '42501';
  end if;
  if tg_table_name = 'savings_goals' and tg_op = 'INSERT'
     and (select count(*) from public.savings_goals g
          where g.household_id = new.household_id and g.profile_id = new.profile_id) >= 30 then
    raise exception 'Goal limit reached.' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_pocket() from public, anon, authenticated;

create trigger pocket_allowances_guard before insert or update on public.pocket_allowances
  for each row execute function private.guard_pocket();
create trigger savings_goals_guard before insert or update on public.savings_goals
  for each row execute function private.guard_pocket();

create policy "pocket_transactions: your own, or people who manage money"
  on public.pocket_transactions for select to authenticated
  using (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  );

create policy "pocket_allowances: your own, or people who manage money"
  on public.pocket_allowances for select to authenticated
  using (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  );
create policy "pocket_allowances: people who manage money set them"
  on public.pocket_allowances for insert to authenticated
  with check (private.has_household_permission(household_id, 'manage_expenses'));
create policy "pocket_allowances: people who manage money change them"
  on public.pocket_allowances for update to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'))
  with check (private.has_household_permission(household_id, 'manage_expenses'));
create policy "pocket_allowances: people who manage money remove them"
  on public.pocket_allowances for delete to authenticated
  using (private.has_household_permission(household_id, 'manage_expenses'));

-- Children set their own goals; people who manage money can help.
create policy "savings_goals: your own, or people who manage money"
  on public.savings_goals for select to authenticated
  using (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  );
create policy "savings_goals: add your own, or as a money manager"
  on public.savings_goals for insert to authenticated
  with check (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  );
create policy "savings_goals: change your own, or as a money manager"
  on public.savings_goals for update to authenticated
  using (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  )
  with check (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  );
create policy "savings_goals: remove your own, or as a money manager"
  on public.savings_goals for delete to authenticated
  using (
    (profile_id = (select auth.uid()) and private.is_household_member(household_id))
    or private.has_household_permission(household_id, 'manage_expenses')
  );

grant select on public.pocket_transactions, public.pocket_allowances, public.savings_goals
  to authenticated;
grant insert (household_id, profile_id, amount_minor, weekday, active)
  on public.pocket_allowances to authenticated;
grant update (amount_minor, weekday, active) on public.pocket_allowances to authenticated;
grant delete on public.pocket_allowances to authenticated;
grant insert (household_id, profile_id, title, target_minor) on public.savings_goals to authenticated;
grant update (title, target_minor, achieved_at) on public.savings_goals to authenticated;
grant delete on public.savings_goals to authenticated;

create function private.pocket_balance(p_household_id uuid, p_profile_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(t.amount_minor), 0)::bigint from public.pocket_transactions t
  where t.household_id = p_household_id and t.profile_id = p_profile_id;
$$;

revoke all on function private.pocket_balance(uuid, uuid) from public, anon, authenticated;

-- Gifts, spending and corrections, by people who manage money, never for
-- themselves. Spending can't take a balance below zero.
create function public.add_pocket_money(
  p_household_id uuid,
  p_profile_id uuid,
  p_amount_minor bigint,
  p_kind public.pocket_kind,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_amount bigint;
begin
  if v_caller is null
     or p_profile_id = v_caller
     or not private.has_household_permission(p_household_id, 'manage_expenses')
     or not exists (
       select 1 from public.household_members m
       where m.household_id = p_household_id and m.profile_id = p_profile_id and m.status = 'active'
     ) then
    raise exception 'You can''t change this person''s pocket money.' using errcode = '42501';
  end if;
  if p_kind not in ('gift', 'spend', 'adjustment') or p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Choose an amount.' using errcode = '22023';
  end if;
  if char_length(p_note) > 120 then
    raise exception 'Keep the note to 120 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('pocket' || p_household_id::text || p_profile_id::text));
  v_amount := case when p_kind = 'spend' then -p_amount_minor else p_amount_minor end;
  if p_kind = 'spend' and private.pocket_balance(p_household_id, p_profile_id) + v_amount < 0 then
    raise exception 'There isn''t that much pocket money.' using errcode = '22023';
  end if;

  insert into public.pocket_transactions (household_id, profile_id, amount_minor, kind, note, created_by)
  values (p_household_id, p_profile_id, v_amount, p_kind, nullif(btrim(p_note), ''), v_caller);
end;
$$;

-- Turns someone's chore points into pocket money at the household's rate.
create function public.swap_points_for_money(
  p_household_id uuid,
  p_profile_id uuid,
  p_points integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_rate integer;
  v_balance bigint;
  v_amount bigint;
begin
  if v_caller is null
     or p_profile_id = v_caller
     or not private.has_household_permission(p_household_id, 'manage_expenses')
     or not exists (
       select 1 from public.household_members m
       where m.household_id = p_household_id and m.profile_id = p_profile_id and m.status = 'active'
     ) then
    raise exception 'You can''t swap this person''s points.' using errcode = '42501';
  end if;
  select h.points_value_minor into v_rate from public.households h where h.id = p_household_id;
  if v_rate is null then
    raise exception 'Set what points are worth first.' using errcode = '22023';
  end if;
  if p_points is null or p_points < 1 or p_points > 1000000 then
    raise exception 'Choose how many points.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_household_id::text || p_profile_id::text));
  select coalesce(sum(pl.delta), 0) into v_balance from public.points_ledger pl
  where pl.household_id = p_household_id and pl.profile_id = p_profile_id;
  if v_balance < p_points then
    raise exception 'Not enough points.' using errcode = '22023';
  end if;
  v_amount := (p_points::bigint * v_rate) / 100;
  if v_amount < 1 then
    raise exception 'That''s too few points to be worth anything yet.' using errcode = '22023';
  end if;

  insert into public.points_ledger (household_id, profile_id, delta, reason, note, created_by)
  values (p_household_id, p_profile_id, -p_points, 'adjustment', 'Swapped for pocket money', v_caller);
  insert into public.pocket_transactions (household_id, profile_id, amount_minor, kind, note, created_by)
  values (p_household_id, p_profile_id, v_amount, 'points', p_points || ' points', v_caller);
  return v_amount;
end;
$$;

revoke all on function public.add_pocket_money(uuid, uuid, bigint, public.pocket_kind, text)
  from public, anon;
revoke all on function public.swap_points_for_money(uuid, uuid, integer) from public, anon;
grant execute on function public.add_pocket_money(uuid, uuid, bigint, public.pocket_kind, text)
  to authenticated;
grant execute on function public.swap_points_for_money(uuid, uuid, integer) to authenticated;


-- ── 4. Notifications, live updates, leaving ─────────────────────────────────

-- The child hears about money given, spent or swapped for them.
create function private.notify_pocket_transactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_money text := private.money_text(new.household_id, abs(new.amount_minor));
begin
  if new.created_by is null then
    return null;
  end if;
  perform private.notify(
    new.profile_id, new.household_id, 'pocket_money', null,
    case new.kind
      when 'gift' then private.display_name(new.created_by) || ' gave you ' || v_money
      when 'spend' then v_money || ' spent'
      when 'points' then 'Points swapped: +' || v_money
      else 'Pocket money ' || case when new.amount_minor > 0 then '+' else '−' end || v_money
    end,
    new.note,
    'money'
  );
  return null;
end;
$$;

create function private.live_money()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_profile uuid;
begin
  if tg_op = 'DELETE' then
    v_household := old.household_id;
  else
    v_household := new.household_id;
  end if;
  if tg_table_name in ('pocket_transactions', 'pocket_allowances', 'savings_goals') then
    v_profile := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    perform private.broadcast('profile:' || v_profile, 'money');
    perform private.broadcast_to_permission(v_household, 'manage_expenses', 'money');
  else
    perform private.broadcast_to_permission(v_household, 'view_expenses', 'money');
  end if;
  return null;
end;
$$;

-- Leaving a household takes you off shared expenses' splits; your pocket
-- money there goes with you.
create function private.cleanup_departed_member_money()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;
  update public.expenses e
  set split_between = array_remove(e.split_between, old.profile_id)
  where e.household_id = old.household_id and old.profile_id = any (e.split_between);
  delete from public.pocket_transactions t
  where t.household_id = old.household_id and t.profile_id = old.profile_id;
  delete from public.pocket_allowances a
  where a.household_id = old.household_id and a.profile_id = old.profile_id;
  delete from public.savings_goals g
  where g.household_id = old.household_id and g.profile_id = old.profile_id;
  return old;
end;
$$;

revoke all on function private.notify_pocket_transactions() from public, anon, authenticated;
revoke all on function private.live_money() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member_money() from public, anon, authenticated;

create trigger pocket_transactions_notify after insert on public.pocket_transactions
  for each row execute function private.notify_pocket_transactions();
create trigger expenses_live after insert or update or delete on public.expenses
  for each row execute function private.live_money();
create trigger settlements_live after insert or update or delete on public.settlements
  for each row execute function private.live_money();
create trigger budgets_live after insert or update or delete on public.budgets
  for each row execute function private.live_money();
create trigger bills_live after insert or update or delete on public.bills
  for each row execute function private.live_money();
create trigger pocket_transactions_live after insert or update or delete on public.pocket_transactions
  for each row execute function private.live_money();
create trigger pocket_allowances_live after insert or update or delete on public.pocket_allowances
  for each row execute function private.live_money();
create trigger savings_goals_live after insert or update or delete on public.savings_goals
  for each row execute function private.live_money();
create trigger household_members_cleanup_money after delete on public.household_members
  for each row execute function private.cleanup_departed_member_money();


-- ── 5. On the timer: bill reminders and allowances ──────────────────────────

-- "Due soon: Rent" for people who manage money, a few days before (09:00 at home).
create function private.remind_bills(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_zone text;
  v_due timestamptz;
  v_person uuid;
begin
  for v_bill in select b.* from public.bills b where b.archived_at is null loop
    v_zone := private.household_time_zone(v_bill.household_id);
    v_due := ((v_bill.next_due - v_bill.remind_days) + time '09:00') at time zone v_zone;
    continue when v_due <= p_from or v_due > p_to;
    continue when not private.claim_reminder('bill:' || v_bill.id || ':' || v_bill.next_due);
    for v_person in select private.members_with(v_bill.household_id, 'manage_expenses') loop
      perform private.notify_system(
        v_person, v_bill.household_id, 'bill_due', v_bill.id,
        case when v_bill.remind_days = 0 then 'Due today: ' else 'Due soon: ' end || v_bill.title,
        to_char(v_bill.next_due, 'Dy, Mon FMDD')
          || coalesce(' · ' || private.money_text(v_bill.household_id, v_bill.amount_minor), ''),
        'money'
      );
    end loop;
  end loop;
end;
$$;

-- Pays weekly allowances from 08:00 at home on their day, once.
create function private.pay_allowances()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowance public.pocket_allowances;
  v_local timestamp;
begin
  for v_allowance in select a.* from public.pocket_allowances a where a.active loop
    v_local := now() at time zone private.household_time_zone(v_allowance.household_id);
    continue when extract(isodow from v_local) <> v_allowance.weekday
      or v_local::time < time '08:00'
      or v_allowance.last_paid_on >= v_local::date;
    continue when not exists (
      select 1 from public.household_members m
      where m.household_id = v_allowance.household_id
        and m.profile_id = v_allowance.profile_id
        and m.status = 'active'
    );
    insert into public.pocket_transactions (household_id, profile_id, amount_minor, kind, note)
    values (v_allowance.household_id, v_allowance.profile_id, v_allowance.amount_minor,
            'allowance', 'Weekly allowance');
    update public.pocket_allowances a
    set last_paid_on = v_local::date
    where a.household_id = v_allowance.household_id and a.profile_id = v_allowance.profile_id;
    perform private.notify_system(
      v_allowance.profile_id, v_allowance.household_id, 'allowance_paid', null,
      'Pocket money: +' || private.money_text(v_allowance.household_id, v_allowance.amount_minor),
      'Your weekly allowance.',
      'money'
    );
  end loop;
end;
$$;

revoke all on function private.remind_bills(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.pay_allowances() from public, anon, authenticated;

create or replace function private.run_scheduled()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz := now();
begin
  select s.last_run into v_from from private.scheduler_state s for update;
  v_from := greatest(v_from, v_to - interval '1 day');

  perform private.remind_events(v_from, v_to);
  perform private.remind_chores(v_from, v_to);
  perform private.remind_bills(v_from, v_to);
  perform private.pay_allowances();

  update private.scheduler_state set last_run = v_to;
  delete from private.sent_reminders r where r.sent_at < now() - interval '40 days';

  perform private.push_system_notifications();
  perform private.process_push_responses();
end;
$$;
