-- ============================================================================
-- Households.xyz: meal planning
-- ============================================================================
-- A household recipe box and a plan of meals by day. Both are for the whole
-- household: members read them, and anyone with create_posts adds and edits
-- them (a family plan is everyone's). Deleting a recipe is for whoever added
-- it, or people who moderate content.
-- The app turns a week's recipes into shopping list items through the API,
-- as the signed-in user, so the list's own rules apply.
-- ============================================================================


-- ── 1. Tables ───────────────────────────────────────────────────────────────

create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- One ingredient per entry ("2 onions"); checked by private.guard_recipe().
  ingredients text[] not null default '{}' check (cardinality(ingredients) <= 60),
  method text check (char_length(method) <= 6000),
  servings smallint check (servings between 1 and 50),
  -- Where the recipe came from: shown as a plain link, https only.
  source_url text check (char_length(source_url) <= 500 and source_url ~ '^https://[^[:space:]]+$'),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index recipes_household_idx on public.recipes (household_id, title);
create index recipes_created_by_idx on public.recipes (created_by);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  on_date date not null,
  slot public.meal_slot not null default 'dinner',
  -- A recipe from the box, or just a name ("Leftovers", "Pizza night").
  recipe_id uuid,
  title text check (char_length(btrim(title)) between 1 and 120),
  note text check (char_length(note) <= 300),
  cook_id uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (recipe_id, household_id)
    references public.recipes (id, household_id) on delete set null (recipe_id),
  constraint meal_plan_entries_named check (recipe_id is not null or title is not null)
);

create index meal_plan_entries_household_idx on public.meal_plan_entries (household_id, on_date);
create index meal_plan_entries_recipe_idx on public.meal_plan_entries (recipe_id);
create index meal_plan_entries_cook_idx on public.meal_plan_entries (cook_id);
create index meal_plan_entries_created_by_idx on public.meal_plan_entries (created_by);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function private.set_updated_at();
create trigger meal_plan_entries_set_updated_at
  before update on public.meal_plan_entries
  for each row execute function private.set_updated_at();

alter table public.recipes enable row level security;
alter table public.meal_plan_entries enable row level security;
revoke all on public.recipes, public.meal_plan_entries from anon, authenticated;


-- ── 2. Guards ───────────────────────────────────────────────────────────────

create function private.guard_recipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.ingredients := array(
    select btrim(i) from unnest(new.ingredients) with ordinality as t (i, ord)
    where nullif(btrim(i), '') is not null
    order by ord
  );
  if exists (select 1 from unnest(new.ingredients) i where char_length(i) > 120) then
    raise exception 'Keep each ingredient to 120 characters.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.recipes r where r.household_id = new.household_id) >= 1000 then
    raise exception 'Recipe limit reached.' using errcode = '54000';
  end if;
  return new;
end;
$$;

create function private.guard_meal_plan_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 then
    if new.cook_id is not null
       and new.cook_id is distinct from (case when tg_op = 'UPDATE' then old.cook_id end)
       and not exists (
         select 1 from public.household_members m
         where m.household_id = new.household_id and m.profile_id = new.cook_id and m.status = 'active'
       ) then
      raise exception 'The cook needs to be in this household.' using errcode = '22023';
    end if;

    if (select count(*) from public.meal_plan_entries e
        where e.household_id = new.household_id
          and e.on_date = new.on_date
          and e.id is distinct from new.id) >= 12 then
      raise exception 'That day is full.' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;

-- A deleted recipe leaves its name behind on the plan.
create function private.keep_planned_recipe_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meal_plan_entries e
  set title = old.title
  where e.recipe_id = old.id and e.title is null;
  return old;
end;
$$;

revoke all on function private.guard_recipe() from public, anon, authenticated;
revoke all on function private.guard_meal_plan_entry() from public, anon, authenticated;
revoke all on function private.keep_planned_recipe_names() from public, anon, authenticated;

create trigger recipes_guard
  before insert or update on public.recipes
  for each row execute function private.guard_recipe();
create trigger recipes_keep_planned_names
  before delete on public.recipes
  for each row execute function private.keep_planned_recipe_names();
create trigger meal_plan_entries_guard
  before insert or update on public.meal_plan_entries
  for each row execute function private.guard_meal_plan_entry();


-- ── 3. Policies & grants ────────────────────────────────────────────────────

create policy "recipes: members see the recipe box"
  on public.recipes for select to authenticated
  using (private.is_household_member(household_id));

create policy "recipes: members with create_posts add recipes"
  on public.recipes for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_household_permission(household_id, 'create_posts')
  );

create policy "recipes: members with create_posts edit recipes"
  on public.recipes for update to authenticated
  using (private.has_household_permission(household_id, 'create_posts'))
  with check (private.has_household_permission(household_id, 'create_posts'));

create policy "recipes: whoever added it, or moderators, delete"
  on public.recipes for delete to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or private.has_household_permission(household_id, 'moderate_content')
    )
  );

grant select on public.recipes to authenticated;
grant insert (household_id, title, ingredients, method, servings, source_url)
  on public.recipes to authenticated;
grant update (title, ingredients, method, servings, source_url, archived_at)
  on public.recipes to authenticated;
grant delete on public.recipes to authenticated;

create policy "meal_plan_entries: members see the plan"
  on public.meal_plan_entries for select to authenticated
  using (private.is_household_member(household_id));

create policy "meal_plan_entries: members with create_posts plan meals"
  on public.meal_plan_entries for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_household_permission(household_id, 'create_posts')
  );

create policy "meal_plan_entries: members with create_posts change the plan"
  on public.meal_plan_entries for update to authenticated
  using (private.has_household_permission(household_id, 'create_posts'))
  with check (private.has_household_permission(household_id, 'create_posts'));

create policy "meal_plan_entries: members with create_posts remove meals"
  on public.meal_plan_entries for delete to authenticated
  using (private.has_household_permission(household_id, 'create_posts'));

grant select on public.meal_plan_entries to authenticated;
grant insert (household_id, on_date, slot, recipe_id, title, note, cook_id)
  on public.meal_plan_entries to authenticated;
grant update (on_date, slot, recipe_id, title, note, cook_id)
  on public.meal_plan_entries to authenticated;
grant delete on public.meal_plan_entries to authenticated;


-- ── 4. Live updates, notifications, leaving ─────────────────────────────────

create trigger recipes_live
  after insert or update or delete on public.recipes
  for each row execute function private.live_household_scope('meals');
create trigger meal_plan_entries_live
  after insert or update or delete on public.meal_plan_entries
  for each row execute function private.live_household_scope('meals');

-- The cook is told.
create function private.notify_meal_plan_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.cook_id is null
     or (tg_op = 'UPDATE' and new.cook_id is not distinct from old.cook_id) then
    return null;
  end if;
  select coalesce(new.title, max(r.title), 'A meal') into v_name
  from public.recipes r where r.id = new.recipe_id;
  perform private.notify(
    new.cook_id, new.household_id, 'meal_to_cook', new.id,
    'You’re cooking: “' || v_name || '”',
    to_char(new.on_date, 'Dy, Mon FMDD') || ' · ' || initcap(new.slot::text)
      || ' · from ' || private.display_name((select auth.uid())),
    'meals'
  );
  return null;
end;
$$;

create function private.cleanup_departed_member_meals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meal_plan_entries e
  set cook_id = null
  where e.household_id = old.household_id and e.cook_id = old.profile_id;
  return old;
end;
$$;

revoke all on function private.notify_meal_plan_entries() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member_meals() from public, anon, authenticated;

create trigger meal_plan_entries_notify
  after insert or update of cook_id on public.meal_plan_entries
  for each row execute function private.notify_meal_plan_entries();
create trigger household_members_cleanup_meals
  after delete on public.household_members
  for each row execute function private.cleanup_departed_member_meals();
