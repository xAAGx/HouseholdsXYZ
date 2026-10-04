-- ============================================================================
-- Households.xyz: live updates, notifications and push
-- ============================================================================
-- Live updates. Changes are announced on Supabase Realtime private channels:
--   household:<id>  for things every member of the household can see
--   profile:<id>    for one person: their notifications, and content shared
--                   only with them (private and selected-member lists, …)
-- A message names only what kind of thing changed ({"scope": "lists"}),
-- never the content: the app then refetches through the API, under RLS.
-- Only the database sends; nobody can broadcast from a browser.
--
-- Notifications. The database writes them as things happen (a chore to
-- approve, an item assigned to you, …) for the people concerned. Each person
-- reads only their own, from households they're still in.
--
-- Push. A browser's push subscription is stored sealed (encrypted by the API
-- with a key only the API holds, bound to its owner), so the database never
-- holds a usable push address. After a change, the API asks for the pushes
-- that change caused (claim_push_jobs) and sends them.
-- ============================================================================


-- ── 1. Live updates ─────────────────────────────────────────────────────────

-- True the first time a key is seen in this transaction: a bulk change sends
-- one message per channel, not one per row.
create function private.first_in_transaction(p_key text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_setting text := 'households.once_' || md5(p_key);
begin
  if coalesce(current_setting(v_setting, true), '') = '1' then
    return false;
  end if;
  perform set_config(v_setting, '1', true);
  return true;
end;
$$;

-- Announces that something in `p_scope` changed on a channel.
create function private.broadcast(p_topic text, p_scope text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_topic is null or not private.first_in_transaction(p_topic || '/' || p_scope) then
    return;
  end if;
  begin
    perform realtime.send(jsonb_build_object('scope', p_scope), 'changed', p_topic, true);
  exception when others then
    -- Live updates are a nicety: they must never stop the change itself.
    null;
  end;
end;
$$;

-- Announces a change to everyone who can see a piece of content.
create function private.broadcast_to_audience(
  p_household_id uuid,
  p_visibility public.content_visibility,
  p_created_by uuid,
  p_member_ids uuid[],
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
  if p_visibility = 'household' then
    perform private.broadcast('household:' || p_household_id, p_scope);
    return;
  end if;
  if p_created_by is not null then
    perform private.broadcast('profile:' || p_created_by, p_scope);
  end if;
  if p_visibility = 'selected_members' then
    foreach v_id in array coalesce(p_member_ids, '{}') loop
      perform private.broadcast('profile:' || v_id, p_scope);
    end loop;
  end if;
end;
$$;

-- Who may listen on a channel. Used by the realtime.messages policy below.
create function private.realtime_topic_allowed(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text := split_part(p_topic, ':', 1);
  v_id text := split_part(p_topic, ':', 2);
begin
  if p_topic is null
     or split_part(p_topic, ':', 3) <> ''
     or v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if v_kind = 'household' then
    return private.is_household_member(v_id::uuid);
  elsif v_kind = 'profile' then
    return v_id::uuid = (select auth.uid()) and private.aal_ok();
  end if;
  return false;
end;
$$;

revoke all on function private.first_in_transaction(text) from public, anon, authenticated;
revoke all on function private.broadcast(text, text) from public, anon, authenticated;
revoke all on function private.broadcast_to_audience(uuid, public.content_visibility, uuid, uuid[], text)
  from public, anon, authenticated;
revoke all on function private.realtime_topic_allowed(text) from public, anon;
grant execute on function private.realtime_topic_allowed(text) to authenticated;

-- Listening only: there is no insert policy, so browsers can't send.
create policy "realtime: members hear their households, people hear themselves"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.realtime_topic_allowed((select realtime.topic()))
  );

-- Lists follow their audience.
create function private.live_lists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.broadcast_to_audience(
      old.household_id, old.visibility, old.created_by,
      array(select lm.profile_id from public.list_members lm where lm.list_id = old.id),
      'lists'
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.broadcast_to_audience(
      new.household_id, new.visibility, new.created_by,
      array(select lm.profile_id from public.list_members lm where lm.list_id = new.id),
      'lists'
    );
  end if;
  return null;
end;
$$;

create function private.live_list_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_id uuid;
  v_list public.lists;
begin
  v_list_id := case when tg_op = 'DELETE' then old.list_id else new.list_id end;
  if not private.first_in_transaction('list/' || v_list_id) then
    return null;
  end if;
  select * into v_list from public.lists l where l.id = v_list_id;
  if found then
    perform private.broadcast_to_audience(
      v_list.household_id, v_list.visibility, v_list.created_by,
      array(select lm.profile_id from public.list_members lm where lm.list_id = v_list.id),
      'lists'
    );
  end if;
  return null;
end;
$$;

create function private.live_list_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    'profile:' || case when tg_op = 'DELETE' then old.profile_id else new.profile_id end,
    'lists'
  );
  return null;
end;
$$;

-- Household-wide things (chores, rewards, points, …): tg_argv[0] is the scope.
create function private.live_household_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if tg_op = 'DELETE' then
    v_household := old.household_id;
  else
    v_household := new.household_id;
  end if;
  perform private.broadcast('household:' || v_household, tg_argv[0]);
  return null;
end;
$$;

-- Joining, leaving and role changes: the household, and the person.
create function private.live_household_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.broadcast('household:' || old.household_id, 'household');
    perform private.broadcast('profile:' || old.profile_id, 'household');
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.broadcast('household:' || new.household_id, 'household');
    perform private.broadcast('profile:' || new.profile_id, 'household');
  end if;
  return null;
end;
$$;

create function private.live_households()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast('household:' || old.id, 'household');
  return null;
end;
$$;

revoke all on function private.live_lists() from public, anon, authenticated;
revoke all on function private.live_list_items() from public, anon, authenticated;
revoke all on function private.live_list_members() from public, anon, authenticated;
revoke all on function private.live_household_scope() from public, anon, authenticated;
revoke all on function private.live_household_members() from public, anon, authenticated;
revoke all on function private.live_households() from public, anon, authenticated;

create trigger lists_live
  after insert or update or delete on public.lists
  for each row execute function private.live_lists();
create trigger list_items_live
  after insert or update or delete on public.list_items
  for each row execute function private.live_list_items();
create trigger list_members_live
  after insert or delete on public.list_members
  for each row execute function private.live_list_members();

create trigger chores_live
  after insert or update or delete on public.chores
  for each row execute function private.live_household_scope('chores');
create trigger chore_completions_live
  after insert or update or delete on public.chore_completions
  for each row execute function private.live_household_scope('chores');
create trigger rewards_live
  after insert or update or delete on public.rewards
  for each row execute function private.live_household_scope('chores');
create trigger reward_redemptions_live
  after insert or update or delete on public.reward_redemptions
  for each row execute function private.live_household_scope('chores');
create trigger points_ledger_live
  after insert or update or delete on public.points_ledger
  for each row execute function private.live_household_scope('chores');

create trigger household_members_live
  after insert or update or delete on public.household_members
  for each row execute function private.live_household_members();
create trigger households_live
  after update on public.households
  for each row execute function private.live_households();


-- ── 2. Notifications ────────────────────────────────────────────────────────

create type public.notification_kind as enum (
  'chore_to_review',  -- to people who manage chores: someone finished one
  'chore_reviewed',   -- to whoever did it: approved, or sent back
  'reward_requested', -- to people who manage chores
  'reward_reviewed',  -- to whoever asked: given, or not this time
  'points_changed',   -- to the person: points given or taken, with the reason
  'item_assigned',    -- to the person a list item is for
  'event_for_you',    -- to the people a calendar event is for
  'meal_to_cook'      -- to the person cooking a planned meal
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind public.notification_kind not null,
  -- What it's about (a completion, request, item, …), so it can be settled
  -- for everyone once someone has dealt with it. Not a foreign key: the
  -- notification outlives it.
  subject_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 300),
  -- Where tapping it goes: an in-app path, never a full URL.
  path text not null check (path ~ '^/h/[0-9a-f-]{36}(/[A-Za-z0-9_-]+)*$'),
  read_at timestamptz,
  -- Set once the API has picked it up to push (claim_push_jobs).
  push_claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_household_idx on public.notifications (household_id);
create index notifications_actor_unclaimed_idx
  on public.notifications (actor_id, created_at) where push_claimed_at is null;
create index notifications_subject_idx on public.notifications (subject_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

create policy "notifications: yours, from households you're in"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and private.is_household_member(household_id));

create policy "notifications: you mark yours as read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and private.is_household_member(household_id))
  with check (recipient_id = (select auth.uid()) and private.is_household_member(household_id));

create policy "notifications: you clear yours"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()) and private.is_household_member(household_id));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

create function private.display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.display_name from public.profiles p where p.id = p_profile_id), 'Someone');
$$;

-- Writes a notification for one person, from whoever is making the change.
-- Nobody is told about their own actions, and only active members hear
-- about a household.
create function private.notify(
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
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_recipient_id is null or p_recipient_id = v_actor then
    return;
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = p_recipient_id and m.status = 'active'
  ) then
    return;
  end if;

  -- Keep inboxes small: three months is plenty.
  delete from public.notifications n
  where n.recipient_id = p_recipient_id and n.created_at < now() - interval '90 days';

  insert into public.notifications
    (recipient_id, household_id, actor_id, kind, subject_id, title, body, path)
  values (
    p_recipient_id,
    p_household_id,
    v_actor,
    p_kind,
    p_subject_id,
    left(p_title, 200),
    left(p_body, 300),
    '/h/' || p_household_id || '/' || p_section
  );
end;
$$;

-- Once someone has dealt with a request, it stops waiting for everyone else.
create function private.settle_notifications(p_subject_id uuid, p_kind public.notification_kind)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
  set read_at = now()
  where n.subject_id = p_subject_id and n.kind = p_kind and n.read_at is null;
$$;

-- People who manage chores in a household, except `p_except`.
create function private.chore_managers(p_household_id uuid, p_except uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id
  from public.household_members m
  where m.household_id = p_household_id
    and m.status = 'active'
    and m.profile_id is distinct from p_except
    and private.member_has_permission(m.profile_id, p_household_id, 'manage_chores');
$$;

revoke all on function private.display_name(uuid) from public, anon, authenticated;
revoke all on function private.notify(uuid, uuid, public.notification_kind, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function private.settle_notifications(uuid, public.notification_kind)
  from public, anon, authenticated;
revoke all on function private.chore_managers(uuid, uuid) from public, anon, authenticated;

-- Chores: done (to approve), approved, sent back.
create function private.notify_chore_completions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_manager uuid;
begin
  select coalesce(max(c.title), 'A chore') into v_title from public.chores c where c.id = new.chore_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    for v_manager in select private.chore_managers(new.household_id, new.completed_by) loop
      perform private.notify(
        v_manager, new.household_id, 'chore_to_review', new.id,
        private.display_name(new.completed_by) || ' finished “' || v_title || '”',
        'Approve it or send it back.',
        'chores'
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    perform private.settle_notifications(new.id, 'chore_to_review');
    if new.status = 'approved' then
      perform private.notify(
        new.completed_by, new.household_id, 'chore_reviewed', new.id,
        '“' || v_title || '” approved',
        case when new.points > 0 then '+' || new.points || ' points' else 'Nice work.' end,
        'chores'
      );
    elsif new.status = 'rejected' then
      perform private.notify(
        new.completed_by, new.household_id, 'chore_reviewed', new.id,
        '“' || v_title || '” needs another go',
        coalesce(new.review_note, 'Have another look, then mark it done again.'),
        'chores'
      );
    end if;
  end if;
  return null;
end;
$$;

-- Rewards: asked for (to approve), given, or not this time.
create function private.notify_reward_redemptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_manager uuid;
begin
  select coalesce(max(r.title), 'A reward') into v_title from public.rewards r where r.id = new.reward_id;

  if tg_op = 'INSERT' then
    for v_manager in select private.chore_managers(new.household_id, new.requested_by) loop
      perform private.notify(
        v_manager, new.household_id, 'reward_requested', new.id,
        private.display_name(new.requested_by) || ' would like “' || v_title || '”',
        new.cost || ' points, already set aside.',
        'chores'
      );
    end loop;
  elsif old.status = 'requested' and new.status <> 'requested' then
    perform private.settle_notifications(new.id, 'reward_requested');
    if new.status = 'approved' then
      perform private.notify(
        new.requested_by, new.household_id, 'reward_reviewed', new.id,
        '“' || v_title || '” is yours',
        'Enjoy it.',
        'chores'
      );
    elsif new.status = 'rejected' then
      perform private.notify(
        new.requested_by, new.household_id, 'reward_reviewed', new.id,
        'Not this time: “' || v_title || '”',
        'Your ' || new.cost || ' points are back.',
        'chores'
      );
    end if;
  end if;
  return null;
end;
$$;

-- Points given or taken by hand, with the reason.
create function private.notify_points_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason = 'adjustment' then
    perform private.notify(
      new.profile_id, new.household_id, 'points_changed', null,
      private.display_name(new.created_by)
        || case when new.delta > 0 then ' gave you ' else ' took ' end
        || abs(new.delta) || case when abs(new.delta) = 1 then ' point' else ' points' end,
      new.note,
      'chores'
    );
  end if;
  return null;
end;
$$;

-- A list item put down for someone.
create function private.notify_list_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_title text;
begin
  if new.assigned_to is null
     or new.done_at is not null
     or (tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to) then
    return null;
  end if;
  select coalesce(max(l.title), 'A list') into v_list_title from public.lists l where l.id = new.list_id;
  perform private.notify(
    new.assigned_to, new.household_id, 'item_assigned', new.id,
    'For you: “' || new.text || '”',
    v_list_title || ' · from ' || private.display_name((select auth.uid())),
    'lists/' || new.list_id
  );
  return null;
end;
$$;

-- Notifications themselves: tell the person's other devices.
create function private.live_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    'profile:' || case when tg_op = 'DELETE' then old.recipient_id else new.recipient_id end,
    'notifications'
  );
  return null;
end;
$$;

-- Leaving a household clears what it sent you.
create function private.cleanup_departed_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where n.household_id = old.household_id and n.recipient_id = old.profile_id;
  return old;
end;
$$;

revoke all on function private.notify_chore_completions() from public, anon, authenticated;
revoke all on function private.notify_reward_redemptions() from public, anon, authenticated;
revoke all on function private.notify_points_ledger() from public, anon, authenticated;
revoke all on function private.notify_list_items() from public, anon, authenticated;
revoke all on function private.live_notifications() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member_notifications()
  from public, anon, authenticated;

create trigger chore_completions_notify
  after insert or update of status on public.chore_completions
  for each row execute function private.notify_chore_completions();
create trigger reward_redemptions_notify
  after insert or update of status on public.reward_redemptions
  for each row execute function private.notify_reward_redemptions();
create trigger points_ledger_notify
  after insert on public.points_ledger
  for each row execute function private.notify_points_ledger();
create trigger list_items_notify
  after insert or update of assigned_to on public.list_items
  for each row execute function private.notify_list_items();
create trigger notifications_live
  after insert or update or delete on public.notifications
  for each row execute function private.live_notifications();
create trigger household_members_cleanup_notifications
  after delete on public.household_members
  for each row execute function private.cleanup_departed_member_notifications();


-- ── 3. Push ─────────────────────────────────────────────────────────────────

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- SHA-256 of the push endpoint: one row per browser, found again to unsubscribe.
  endpoint_hash text not null check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  -- The browser's push subscription, encrypted by the API (AES-GCM, bound to
  -- profile_id). The database can't read it.
  sealed text not null check (char_length(sealed) between 20 and 4000),
  -- Off by default: the lock screen shows only "Something new", not what.
  show_details boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, endpoint_hash)
);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function private.set_updated_at();

create function private.guard_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions s where s.profile_id = new.profile_id) >= 10 then
    raise exception 'Notifications are on for too many devices. Turn them off on one first.'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_push_subscription() from public, anon, authenticated;

create trigger push_subscriptions_guard
  before insert on public.push_subscriptions
  for each row execute function private.guard_push_subscription();

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create policy "push_subscriptions: your own devices"
  on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()) and private.aal_ok());

create policy "push_subscriptions: you add your devices"
  on public.push_subscriptions for insert to authenticated
  with check (profile_id = (select auth.uid()) and private.aal_ok());

create policy "push_subscriptions: you change your devices"
  on public.push_subscriptions for update to authenticated
  using (profile_id = (select auth.uid()) and private.aal_ok())
  with check (profile_id = (select auth.uid()) and private.aal_ok());

create policy "push_subscriptions: you remove your devices"
  on public.push_subscriptions for delete to authenticated
  using (profile_id = (select auth.uid()) and private.aal_ok());

grant select on public.push_subscriptions to authenticated;
grant insert (endpoint_hash, sealed, show_details) on public.push_subscriptions to authenticated;
grant update (sealed, show_details) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

-- Which subscriptions were handed to whom, so a push service's "gone" can be
-- acted on only by the request that just used it.
create table private.push_claims (
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  claimed_by uuid not null,
  claimed_at timestamptz not null default now()
);

create index push_claims_claimed_by_idx on private.push_claims (claimed_by, claimed_at);
create index push_claims_subscription_idx on private.push_claims (subscription_id);
alter table private.push_claims enable row level security;
revoke all on private.push_claims from public, anon, authenticated;

-- The pushes your own recent changes caused, each once. Subscriptions come
-- back sealed: only the API can open them.
create function public.claim_push_jobs()
returns table (
  subscription_id uuid,
  recipient_id uuid,
  sealed text,
  show_details boolean,
  title text,
  body text,
  path text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null or not private.aal_ok() then
    return;
  end if;

  delete from private.push_claims pc where pc.claimed_at < now() - interval '1 day';

  return query
  with claimed as (
    update public.notifications n
    set push_claimed_at = now()
    where n.id in (
      select n2.id
      from public.notifications n2
      where n2.actor_id = v_caller
        and n2.push_claimed_at is null
        and n2.created_at > now() - interval '10 minutes'
      order by n2.created_at
      limit 50
      for update skip locked
    )
    returning n.recipient_id, n.title, n.body, n.path
  ),
  jobs as (
    select s.id as subscription_id, c.recipient_id, s.sealed, s.show_details, c.title, c.body, c.path
    from claimed c
    join public.push_subscriptions s on s.profile_id = c.recipient_id
  ),
  noted as (
    insert into private.push_claims (subscription_id, claimed_by)
    select distinct j.subscription_id, v_caller from jobs j
  )
  select j.subscription_id, j.recipient_id, j.sealed, j.show_details, j.title, j.body, j.path
  from jobs j;
end;
$$;

-- Forgets subscriptions a push service said are gone, if you were just
-- handed them.
create function public.drop_gone_push_subscriptions(p_subscription_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions s
  where s.id = any (coalesce(p_subscription_ids, '{}'))
    and exists (
      select 1 from private.push_claims pc
      where pc.subscription_id = s.id
        and pc.claimed_by = (select auth.uid())
        and pc.claimed_at > now() - interval '10 minutes'
    );
$$;

revoke all on function public.claim_push_jobs() from public, anon;
revoke all on function public.drop_gone_push_subscriptions(uuid[]) from public, anon;
grant execute on function public.claim_push_jobs() to authenticated;
grant execute on function public.drop_gone_push_subscriptions(uuid[]) to authenticated;
