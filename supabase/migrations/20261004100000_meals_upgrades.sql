-- ============================================================================
-- Households.xyz: meal planning upgrades
-- ============================================================================
-- Recipes get tags ("Quick", "Vegetarian"), so the box can be filtered; a
-- planned meal can be for a different number of people than the recipe
-- serves, and the app scales its amounts (cooking and shopping).
-- ============================================================================

alter table public.recipes
  add column tags text[] not null default '{}' check (cardinality(tags) <= 10);

alter table public.meal_plan_entries
  add column servings smallint check (servings between 1 and 50);

grant insert (tags) on public.recipes to authenticated;
grant update (tags) on public.recipes to authenticated;
grant insert (servings) on public.meal_plan_entries to authenticated;
grant update (servings) on public.meal_plan_entries to authenticated;

-- Ingredients as before; tags trimmed, each once (whatever the case), 1-30
-- characters.
create or replace function private.guard_recipe()
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

  new.tags := array(
    select tag from (
      select distinct on (lower(btrim(t))) btrim(t) as tag, ord
      from unnest(new.tags) with ordinality as x (t, ord)
      where nullif(btrim(t), '') is not null
      order by lower(btrim(t)), ord
    ) firsts
    order by ord
  );
  if exists (select 1 from unnest(new.tags) t where char_length(t) > 30) then
    raise exception 'Keep each tag to 30 characters.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.recipes r where r.household_id = new.household_id) >= 1000 then
    raise exception 'Recipe limit reached.' using errcode = '54000';
  end if;
  return new;
end;
$$;
