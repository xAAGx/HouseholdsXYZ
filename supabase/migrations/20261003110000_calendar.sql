-- ============================================================================
-- Households.xyz: shared calendar
-- ============================================================================
-- Events have the same audiences as lists, never wider than the household:
--   household         every member (guests read)
--   selected_members  the creator and the members in shared_with
--   private           only the creator. A child's private event is hidden
--                     from their parents too, as with lists.
-- `people` says who an event is for (the dentist is for Leo); they're told
-- when they're added, and must be able to see it.
--
-- Dates are wall-clock dates and times in the household's own time zone
-- (`time_zone`, IANA): a 9:00 swim lesson stays at 9:00 across clock changes.
-- Repeating events are stored once and expanded by the app; skipped_on holds
-- the dates of single occurrences that were cancelled.
-- ============================================================================


-- ── 1. Table ────────────────────────────────────────────────────────────────

create type public.event_repeat as enum (
  'none', 'daily', 'weekly', 'fortnightly', 'monthly', 'yearly'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (char_length(notes) <= 1000),
  location text check (char_length(location) <= 200),
  starts_on date not null,
  ends_on date not null,
  -- Both null: all day.
  start_time time,
  end_time time,
  time_zone text not null
    check (char_length(time_zone) <= 64 and time_zone ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$'),
  repeat public.event_repeat not null default 'none',
  repeat_until date,
  skipped_on date[] not null default '{}' check (cardinality(skipped_on) <= 200),
  people uuid[] not null default '{}' check (cardinality(people) <= 20),
  visibility public.content_visibility not null default 'household'
    check (visibility in ('private', 'selected_members', 'household')),
  shared_with uuid[] not null default '{}' check (cardinality(shared_with) <= 100),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  constraint events_dates check (ends_on >= starts_on and ends_on - starts_on <= 31),
  constraint events_end_needs_start check (end_time is null or start_time is not null),
  constraint events_time_order
    check (start_time is null or end_time is null or ends_on > starts_on or end_time >= start_time),
  constraint events_repeat_until
    check (repeat_until is null or (repeat <> 'none' and repeat_until >= starts_on)),
  -- A repeat can't overlap the next one.
  constraint events_repeat_span check (
    case repeat
      when 'daily' then ends_on = starts_on
      when 'weekly' then ends_on - starts_on < 7
      when 'fortnightly' then ends_on - starts_on < 14
      else true
    end
  )
);

create index events_household_idx on public.events (household_id, starts_on);
create index events_created_by_idx on public.events (created_by);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function private.set_updated_at();

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;


-- ── 2. Guards ───────────────────────────────────────────────────────────────

create function private.guard_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  -- Changes the database makes itself (someone leaving) skip the checks for
  -- people's own requests.
  if pg_trigger_depth() = 1 then
    if tg_op = 'UPDATE'
       and v_caller is not null
       and old.created_by is distinct from v_caller
       and (new.visibility is distinct from old.visibility
            or new.shared_with is distinct from old.shared_with) then
      raise exception 'Only the event''s creator can change who sees it.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT'
       and (select count(*) from public.events e where e.household_id = new.household_id) >= 5000 then
      raise exception 'Event limit reached.' using errcode = '54000';
    end if;

    -- Shared with: members of the household, each once, not the creator.
    if new.visibility <> 'selected_members' then
      new.shared_with := '{}';
    end if;
    new.shared_with := array(
      select distinct s from unnest(new.shared_with) s where s is distinct from new.created_by
    );
    if exists (
      select 1 from unnest(new.shared_with) s
      where not exists (
        select 1 from public.household_members m
        where m.household_id = new.household_id and m.profile_id = s and m.status = 'active'
      )
    ) then
      raise exception 'You can only share with members of this household.' using errcode = '22023';
    end if;

    -- Who it's for: each once, and only people who can see it.
    if (select count(distinct p) from unnest(new.people) p) <> cardinality(new.people)
       or exists (select 1 from unnest(new.people) p where p is null) then
      raise exception 'Choose each person once.' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(new.people) p
      where not exists (
          select 1 from public.household_members m
          where m.household_id = new.household_id and m.profile_id = p and m.status = 'active'
        )
        or (new.visibility = 'private' and p is distinct from new.created_by)
        or (new.visibility = 'selected_members'
            and p is distinct from new.created_by
            and not (p = any (new.shared_with)))
    ) then
      raise exception 'An event can only be for people who can see it.' using errcode = '22023';
    end if;
  end if;

  -- Skipped dates: sorted, each once.
  new.skipped_on := array(select distinct d from unnest(new.skipped_on) d where d is not null order by d);

  return new;
end;
$$;

revoke all on function private.guard_event() from public, anon, authenticated;

create trigger events_guard
  before insert or update on public.events
  for each row execute function private.guard_event();


-- ── 3. Policies & grants ────────────────────────────────────────────────────

create policy "events: members see the events shared with them"
  on public.events for select to authenticated
  using (
    private.is_household_member(household_id)
    and (
      visibility = 'household'
      or created_by = (select auth.uid())
      or (visibility = 'selected_members' and (select auth.uid()) = any (shared_with))
    )
  );

create policy "events: members with create_posts add events"
  on public.events for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_household_permission(household_id, 'create_posts')
  );

-- Creators edit their events; people who manage the calendar can also edit
-- household events (never private or selected-member ones).
create policy "events: creators, or calendar managers for household events, edit"
  on public.events for update to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'manage_calendar'))
    )
  )
  with check (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'manage_calendar'))
    )
  );

create policy "events: creators, or calendar managers for household events, delete"
  on public.events for delete to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'manage_calendar'))
    )
  );

grant select on public.events to authenticated;
grant insert (
  household_id, title, notes, location, starts_on, ends_on, start_time, end_time, time_zone,
  repeat, repeat_until, people, visibility, shared_with
) on public.events to authenticated;
grant update (
  title, notes, location, starts_on, ends_on, start_time, end_time, time_zone,
  repeat, repeat_until, skipped_on, people, visibility, shared_with
) on public.events to authenticated;
grant delete on public.events to authenticated;


-- ── 4. Live updates, notifications, leaving ─────────────────────────────────

create function private.live_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.broadcast_to_audience(
      old.household_id, old.visibility, old.created_by, old.shared_with, 'calendar'
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.broadcast_to_audience(
      new.household_id, new.visibility, new.created_by, new.shared_with, 'calendar'
    );
  end if;
  return null;
end;
$$;

-- People newly added to an event are told.
create function private.notify_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_when text := to_char(new.starts_on, 'Dy, Mon FMDD')
    || coalesce(', ' || to_char(new.start_time, 'HH24:MI'), '');
begin
  for v_person in
    select p from unnest(new.people) p
    where tg_op = 'INSERT' or not (p = any (old.people))
  loop
    perform private.notify(
      v_person, new.household_id, 'event_for_you', new.id,
      'For you: “' || new.title || '”',
      v_when || ' · from ' || private.display_name((select auth.uid())),
      'calendar'
    );
  end loop;
  return null;
end;
$$;

-- Leaving takes your private events with you and takes you off the rest.
create function private.cleanup_departed_member_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;

  delete from public.events e
  where e.household_id = old.household_id
    and e.created_by = old.profile_id
    and e.visibility = 'private';

  update public.events e
  set shared_with = array_remove(e.shared_with, old.profile_id),
      people = array_remove(e.people, old.profile_id)
  where e.household_id = old.household_id
    and (old.profile_id = any (e.shared_with) or old.profile_id = any (e.people));

  return old;
end;
$$;

revoke all on function private.live_events() from public, anon, authenticated;
revoke all on function private.notify_events() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member_events() from public, anon, authenticated;

create trigger events_live
  after insert or update or delete on public.events
  for each row execute function private.live_events();
create trigger events_notify
  after insert or update of people on public.events
  for each row execute function private.notify_events();
create trigger household_members_cleanup_events
  after delete on public.household_members
  for each row execute function private.cleanup_departed_member_events();
