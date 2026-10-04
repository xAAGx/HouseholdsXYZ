-- ============================================================================
-- Households.xyz: reminders
-- ============================================================================
-- A timer in the database (pg_cron, every minute) runs private.run_scheduled(),
-- which writes due reminders as notifications: events ("Dentist in an hour"),
-- chores not done by a time, and (in later migrations) bills, allowances and
-- expiring documents. Those notifications have no actor, so the API can't
-- push them after a request; instead the database posts them (sealed, as
-- always) to the API's /internal/push with pg_net, signed with a secret kept
-- in Supabase Vault and in the API's environment. No Supabase secret key.
-- Without pg_cron, pg_net or the Vault secrets, reminders still appear in the
-- app; only the push is skipped.
--
-- People who manage chores can also nudge whoever's turn it is.
-- ============================================================================


-- ── 1. The household's time zone (reminders at 9:00 are 9:00 at home) ───────

alter table public.households
  add column time_zone text
    check (char_length(time_zone) <= 64 and time_zone ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$');

grant update (time_zone) on public.households to authenticated;

-- A name Postgres doesn't know (it's checked only by shape above) falls back to UTC.
create function private.household_time_zone(p_household_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone text;
begin
  select h.time_zone into v_zone from public.households h where h.id = p_household_id;
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone) then
    return 'UTC';
  end if;
  return v_zone;
end;
$$;

revoke all on function private.household_time_zone(uuid) from public, anon, authenticated;


-- ── 2. New kinds of notification ────────────────────────────────────────────

alter type public.notification_kind add value if not exists 'event_reminder';
alter type public.notification_kind add value if not exists 'chore_reminder';
alter type public.notification_kind add value if not exists 'chore_nudge';


-- ── 3. What gets a reminder ─────────────────────────────────────────────────

-- Minutes before an event starts (all-day events: before 09:00 on its first day).
alter table public.events
  add column reminders integer[] not null default '{}' check (cardinality(reminders) <= 5);

grant insert (reminders) on public.events to authenticated;
grant update (reminders) on public.events to authenticated;

-- "If it isn't done by 18:00, remind whoever's turn it is."
alter table public.chores add column remind_at time;

grant insert (remind_at) on public.chores to authenticated;
grant update (remind_at) on public.chores to authenticated;

-- The calendar guard, plus reminders: each once, up to four weeks before.
create or replace function private.guard_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
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

    if exists (select 1 from unnest(new.reminders) r where r is null or r < 0 or r > 40320) then
      raise exception 'Reminders can be at most four weeks before.' using errcode = '22023';
    end if;
  end if;

  new.skipped_on := array(select distinct d from unnest(new.skipped_on) d where d is not null order by d);
  new.reminders := array(select distinct r from unnest(new.reminders) r where r is not null order by r);

  return new;
end;
$$;


-- ── 4. Writing reminders ────────────────────────────────────────────────────

-- Reminders already written, so each is sent once however the timer runs.
create table private.sent_reminders (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- When the timer last ran.
create table private.scheduler_state (
  id boolean primary key default true check (id),
  last_run timestamptz not null
);
insert into private.scheduler_state (last_run) values (now());

-- Push requests sent to the API, to read back which devices are gone.
create table private.push_requests (
  request_id bigint primary key,
  created_at timestamptz not null default now()
);

alter table private.sent_reminders enable row level security;
alter table private.scheduler_state enable row level security;
alter table private.push_requests enable row level security;
revoke all on private.sent_reminders, private.scheduler_state, private.push_requests
  from public, anon, authenticated;

-- True the first time a reminder key is seen (and records it).
create function private.claim_reminder(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sent_reminders (key) values (p_key) on conflict do nothing;
  return found;
end;
$$;

-- A notification from the household itself (no actor): reminders, allowances.
create function private.notify_system(
  p_recipient_id uuid,
  p_household_id uuid,
  p_kind public.notification_kind,
  p_subject_id uuid,
  p_title text,
  p_body text,
  p_section text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = p_recipient_id and m.status = 'active'
  ) then
    return;
  end if;
  insert into public.notifications
    (recipient_id, household_id, actor_id, kind, subject_id, title, body, path)
  values (
    p_recipient_id,
    p_household_id,
    null,
    p_kind,
    p_subject_id,
    left(p_title, 200),
    left(p_body, 300),
    '/h/' || p_household_id || '/' || p_section
  );
end;
$$;

-- The date `p_start` + `p_months` months, or null if that month has no such
-- day (a monthly event on the 31st skips 30-day months), as the app does.
create function private.add_months_exact(p_start date, p_months integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first date := (date_trunc('month', p_start) + make_interval(months => p_months))::date;
  v_day integer := extract(day from p_start)::integer;
begin
  if v_day > extract(day from (v_first + interval '1 month' - interval '1 day'))::integer then
    return null;
  end if;
  return v_first + (v_day - 1);
end;
$$;

-- The days an event starts between two dates: mirrors eventOccurrences in
-- packages/shared (calendar/occurrences.ts).
create function private.event_start_dates(p_event public.events, p_from date, p_to date)
returns setof date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first integer;
  v_last integer;
  v_months integer := (extract(year from p_from)::integer * 12 + extract(month from p_from)::integer)
    - (extract(year from p_event.starts_on)::integer * 12 + extract(month from p_event.starts_on)::integer);
  v_months_to integer := (extract(year from p_to)::integer * 12 + extract(month from p_to)::integer)
    - (extract(year from p_event.starts_on)::integer * 12 + extract(month from p_event.starts_on)::integer);
  v_day date;
  k integer;
begin
  case p_event.repeat
    when 'none' then v_first := 0; v_last := 0;
    when 'daily' then v_first := p_from - p_event.starts_on; v_last := p_to - p_event.starts_on;
    when 'weekly' then v_first := floor((p_from - p_event.starts_on) / 7.0); v_last := floor((p_to - p_event.starts_on) / 7.0);
    when 'fortnightly' then v_first := floor((p_from - p_event.starts_on) / 14.0); v_last := floor((p_to - p_event.starts_on) / 14.0);
    when 'monthly' then v_first := v_months; v_last := v_months_to;
    when 'yearly' then v_first := floor(v_months / 12.0); v_last := floor(v_months_to / 12.0);
  end case;

  for k in greatest(0, v_first)..greatest(-1, v_last) loop
    v_day := case p_event.repeat
      when 'none' then p_event.starts_on
      when 'daily' then p_event.starts_on + k
      when 'weekly' then p_event.starts_on + 7 * k
      when 'fortnightly' then p_event.starts_on + 14 * k
      when 'monthly' then private.add_months_exact(p_event.starts_on, k)
      when 'yearly' then private.add_months_exact(p_event.starts_on, 12 * k)
    end;
    if v_day is not null
       and v_day between p_from and p_to
       and (p_event.repeat_until is null or v_day <= p_event.repeat_until)
       and not (v_day = any (p_event.skipped_on)) then
      return next v_day;
    end if;
  end loop;
end;
$$;

-- "Today at 15:30", "Tomorrow", "Tue, Oct 6 at 15:30", in the event's time zone.
create function private.when_text(p_day date, p_time time, p_zone text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when p_day = (now() at time zone p_zone)::date then 'Today'
           when p_day = (now() at time zone p_zone)::date + 1 then 'Tomorrow'
           else to_char(p_day, 'Dy, Mon FMDD')
         end
         || coalesce(' at ' || to_char(p_time, 'HH24:MI'), '');
$$;

-- Event reminders due between two moments.
create function private.remind_events(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_zone text;
  v_day date;
  v_offset integer;
  v_start timestamptz;
  v_person uuid;
begin
  for v_event in
    select e.* from public.events e where cardinality(e.reminders) > 0
  loop
    v_zone := case
      when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_event.time_zone)
      then v_event.time_zone else 'UTC' end;
    for v_day in
      select d from private.event_start_dates(
        v_event,
        (p_from at time zone v_zone)::date - 1,
        ((p_to + make_interval(mins => (select max(r) from unnest(v_event.reminders) r)))
          at time zone v_zone)::date + 1
      ) d
    loop
      v_start := (v_day + coalesce(v_event.start_time, time '09:00')) at time zone v_zone;
      foreach v_offset in array v_event.reminders loop
        if v_start - make_interval(mins => v_offset) > p_from
           and v_start - make_interval(mins => v_offset) <= p_to
           and private.claim_reminder('event:' || v_event.id || ':' || v_day || ':' || v_offset) then
          -- For the people it's for; for whoever added it when it's for everyone.
          for v_person in
            select unnest(case when cardinality(v_event.people) > 0
                               then v_event.people else array[v_event.created_by] end)
          loop
            perform private.notify_system(
              v_person, v_event.household_id, 'event_reminder', v_event.id,
              v_event.title,
              private.when_text(v_day, v_event.start_time, v_zone)
                || coalesce(' · ' || v_event.location, ''),
              'calendar'
            );
          end loop;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

-- Chores not done by their reminder time, for whoever's turn it is. Daily
-- chores on their days; weekly ones on Sunday, monthly ones on the last day,
-- one-off ones on their due date: the last chance.
create function private.remind_chores(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chore public.chores;
  v_zone text;
  v_today date;
  v_due timestamptz;
  v_period date;
  v_person uuid;
  v_last_chance boolean;
begin
  for v_chore in
    select c.* from public.chores c where c.remind_at is not null and c.archived_at is null
  loop
    v_zone := private.household_time_zone(v_chore.household_id);
    v_today := (p_to at time zone v_zone)::date;
    v_due := (v_today + v_chore.remind_at) at time zone v_zone;
    continue when v_due <= p_from or v_due > p_to;

    v_last_chance := case v_chore.repeat
      when 'daily' then v_chore.weekdays is null
        or extract(isodow from v_today)::smallint = any (v_chore.weekdays)
      when 'weekly' then extract(isodow from v_today) = 7
      when 'monthly' then v_today = (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date
      when 'once' then v_chore.due_on = v_today
    end;
    continue when not coalesce(v_last_chance, false);

    v_period := private.chore_period_start(v_chore.repeat, v_today, v_chore.created_at::date);
    continue when exists (
      select 1 from public.chore_completions cc
      where cc.chore_id = v_chore.id and cc.period_start = v_period and cc.status <> 'rejected'
    );
    v_person := private.chore_assignee(v_chore, v_period);
    continue when v_person is null;
    continue when not private.claim_reminder('chore:' || v_chore.id || ':' || v_today);

    perform private.notify_system(
      v_person, v_chore.household_id, 'chore_reminder', v_chore.id,
      'Not done yet: “' || v_chore.title || '”',
      case v_chore.repeat
        when 'weekly' then 'Last day this week.'
        when 'monthly' then 'Last day this month.'
        else 'Mark it done when it’s finished.'
      end,
      'chores'
    );
  end loop;
end;
$$;

revoke all on function private.claim_reminder(text) from public, anon, authenticated;
revoke all on function private.notify_system(uuid, uuid, public.notification_kind, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function private.add_months_exact(date, integer) from public, anon, authenticated;
revoke all on function private.event_start_dates(public.events, date, date)
  from public, anon, authenticated;
revoke all on function private.when_text(date, time, text) from public, anon, authenticated;
revoke all on function private.remind_events(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.remind_chores(timestamptz, timestamptz) from public, anon, authenticated;


-- ── 5. Pushing them ─────────────────────────────────────────────────────────

-- Posts the household's own notifications (no actor) to the API's
-- /internal/push, sealed. Needs pg_net and two Vault secrets:
--   households_push_url     https://<api>/internal/push
--   households_push_secret  the same value as the API's INTERNAL_PUSH_SECRET
-- Without them, nothing is sent (the notifications still show in the app).
create function private.push_system_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_jobs jsonb;
  v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return;
  end if;
  execute $q$
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'households_push_url' limit 1),
      (select decrypted_secret from vault.decrypted_secrets where name = 'households_push_secret' limit 1)
  $q$ into v_url, v_secret;
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return;
  end if;

  with claimed as (
    update public.notifications n
    set push_claimed_at = now()
    where n.id in (
      select n2.id from public.notifications n2
      where n2.actor_id is null
        and n2.push_claimed_at is null
        and n2.created_at > now() - interval '30 minutes'
      order by n2.created_at
      limit 200
      for update skip locked
    )
    returning n.recipient_id, n.title, n.body, n.path
  )
  select jsonb_agg(jsonb_build_object(
           'subscription_id', s.id,
           'recipient_id', c.recipient_id,
           'sealed', s.sealed,
           'show_details', s.show_details,
           'title', c.title,
           'body', c.body,
           'path', c.path
         ))
  into v_jobs
  from claimed c
  join public.push_subscriptions s on s.profile_id = c.recipient_id;

  if v_jobs is null then
    return;
  end if;

  execute $q$
    select net.http_post(
      url := $1,
      body := jsonb_build_object('jobs', $2),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || $3),
      timeout_milliseconds := 10000
    )
  $q$ into v_request using v_url, v_jobs, v_secret;
  insert into private.push_requests (request_id) values (v_request) on conflict do nothing;
end;
$$;

-- Reads the API's answers ({"gone": [subscription ids]}) and forgets devices
-- a push service said are gone.
create function private.process_push_responses()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request bigint;
  v_body text;
begin
  if to_regclass('net._http_response') is null then
    delete from private.push_requests where created_at < now() - interval '1 hour';
    return;
  end if;
  for v_request in select pr.request_id from private.push_requests pr loop
    execute 'select content from net._http_response where id = $1' into v_body using v_request;
    if v_body is not null then
      begin
        delete from public.push_subscriptions s
        where s.id in (
          select (jsonb_array_elements_text(v_body::jsonb -> 'gone'))::uuid
        );
      exception when others then
        null;
      end;
      delete from private.push_requests pr where pr.request_id = v_request;
    end if;
  end loop;
  delete from private.push_requests pr where pr.created_at < now() - interval '1 hour';
end;
$$;

revoke all on function private.push_system_notifications() from public, anon, authenticated;
revoke all on function private.process_push_responses() from public, anon, authenticated;


-- ── 6. The timer ────────────────────────────────────────────────────────────

-- Everything that's due since the last run. Later migrations add to this.
create function private.run_scheduled()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz := now();
begin
  -- One run at a time.
  select s.last_run into v_from from private.scheduler_state s for update;
  -- After a long gap, don't send a flood of old reminders.
  v_from := greatest(v_from, v_to - interval '1 day');

  perform private.remind_events(v_from, v_to);
  perform private.remind_chores(v_from, v_to);

  update private.scheduler_state set last_run = v_to;
  delete from private.sent_reminders r where r.sent_at < now() - interval '40 days';

  perform private.push_system_notifications();
  perform private.process_push_responses();
end;
$$;

revoke all on function private.run_scheduled() from public, anon, authenticated;

-- Every minute, where the hosted database has pg_cron (and pg_net for push).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('households-scheduled', '* * * * *', 'select private.run_scheduled()');
  end if;
end;
$$;


-- ── 7. Nudges ───────────────────────────────────────────────────────────────

-- People who manage chores remind whoever's turn it is, at most once an hour
-- per chore.
create function public.nudge_chore(p_chore_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_chore public.chores;
  v_today date;
  v_period date;
  v_person uuid;
begin
  select * into v_chore from public.chores c where c.id = p_chore_id;
  if not found
     or v_caller is null
     or v_chore.archived_at is not null
     or not private.has_household_permission(v_chore.household_id, 'manage_chores') then
    raise exception 'You can''t send a reminder for this chore.' using errcode = '42501';
  end if;

  v_today := (now() at time zone private.household_time_zone(v_chore.household_id))::date;
  v_period := private.chore_period_start(v_chore.repeat, v_today, v_chore.created_at::date);
  v_person := private.chore_assignee(v_chore, v_period);
  if v_person is null or v_person = v_caller then
    raise exception 'There''s nobody to remind for this one.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.notifications n
    where n.subject_id = v_chore.id
      and n.kind = 'chore_nudge'
      and n.created_at > now() - interval '1 hour'
  ) then
    raise exception 'Already reminded in the last hour.' using errcode = '54000';
  end if;

  perform private.notify(
    v_person, v_chore.household_id, 'chore_nudge', v_chore.id,
    private.display_name(v_caller) || ' reminded you: “' || v_chore.title || '”',
    'Mark it done when it’s finished.',
    'chores'
  );
end;
$$;

revoke all on function public.nudge_chore(uuid) from public, anon;
grant execute on function public.nudge_chore(uuid) to authenticated;
