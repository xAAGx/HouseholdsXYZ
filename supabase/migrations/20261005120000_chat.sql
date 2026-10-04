-- ============================================================================
-- Households.xyz: family chat
-- ============================================================================
-- Conversations live inside one household; nobody outside it can ever be in
-- one (children included):
--   household  everyone in the household (guests read, members with
--              create_posts write); one per household, made automatically
--   group      the people chosen, with a name
--   direct     two people
-- Group and direct conversations are visible only to the people in them,
-- parents included: a child's chat with a sibling is theirs.
-- Messages are edited or deleted by their author; moderators can delete in
-- the household chat. Deleting keeps a "deleted" line, not the text.
-- Photos sit in the private household-media bucket under
-- <household>/chat/<conversation>/…, readable only by people who can see
-- the conversation.
-- ============================================================================


-- ── 1. Tables ───────────────────────────────────────────────────────────────

create type public.conversation_kind as enum ('household', 'group', 'direct');

alter type public.notification_kind add value if not exists 'chat_message';

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind public.conversation_kind not null,
  -- Groups have a name; the household chat and direct ones don't.
  title text check (char_length(btrim(title)) between 1 and 80),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (id, household_id),
  check ((kind = 'group') = (title is not null))
);

create unique index conversations_one_household_chat
  on public.conversations (household_id) where kind = 'household';
create index conversations_household_idx on public.conversations (household_id, last_message_at desc);
create index conversations_created_by_idx on public.conversations (created_by);

-- Who is in a group or direct conversation; for the household chat, just
-- people's read state.
create table public.conversation_members (
  conversation_id uuid not null,
  household_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id),
  foreign key (conversation_id, household_id)
    references public.conversations (id, household_id) on delete cascade
);

create index conversation_members_profile_idx on public.conversation_members (profile_id);
create index conversation_members_household_idx on public.conversation_members (household_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  household_id uuid not null,
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  image_path text check (char_length(image_path) <= 300),
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  foreign key (conversation_id, household_id)
    references public.conversations (id, household_id) on delete cascade,
  check (deleted_at is not null or char_length(btrim(body)) > 0 or image_path is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_household_idx on public.messages (household_id);
create index messages_author_idx on public.messages (author_id);
create index messages_reply_to_idx on public.messages (reply_to);
create index messages_image_idx on public.messages (image_path) where image_path is not null;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.conversation_members, public.messages
  from anon, authenticated;


-- ── 2. Who's in a conversation ──────────────────────────────────────────────

create function private.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.profile_id = (select auth.uid())
  );
$$;

create function private.can_see_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and private.is_household_member(c.household_id)
      and (c.kind = 'household' or private.is_conversation_member(c.id))
  );
$$;

create function private.can_post_in_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_see_conversation(p_conversation_id)
    and private.has_household_permission(
      (select c.household_id from public.conversations c where c.id = p_conversation_id),
      'create_posts'
    );
$$;

-- Everyone who takes part: all active members for the household chat,
-- otherwise the conversation's members who are still in the household.
create function private.conversation_participants(p_conversation_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id
  from public.conversations c
  join public.household_members m on m.household_id = c.household_id and m.status = 'active'
  where c.id = p_conversation_id
    and (
      c.kind = 'household'
      or exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c.id and cm.profile_id = m.profile_id
      )
    );
$$;

revoke all on function private.is_conversation_member(uuid) from public, anon;
revoke all on function private.can_see_conversation(uuid) from public, anon;
revoke all on function private.can_post_in_conversation(uuid) from public, anon;
revoke all on function private.conversation_participants(uuid) from public, anon, authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.can_see_conversation(uuid) to authenticated;
grant execute on function private.can_post_in_conversation(uuid) to authenticated;


-- ── 3. Policies & grants ────────────────────────────────────────────────────

create policy "conversations: the people in them"
  on public.conversations for select to authenticated
  using (
    private.is_household_member(household_id)
    and (kind = 'household' or private.is_conversation_member(id))
  );

create policy "conversations: people in a group rename it"
  on public.conversations for update to authenticated
  using (kind = 'group' and private.can_post_in_conversation(id))
  with check (kind = 'group' and private.can_post_in_conversation(id));

create policy "conversation_members: visible to people in the conversation"
  on public.conversation_members for select to authenticated
  using (private.can_see_conversation(conversation_id));

create policy "conversation_members: your own settings"
  on public.conversation_members for update to authenticated
  using (profile_id = (select auth.uid()) and private.can_see_conversation(conversation_id))
  with check (profile_id = (select auth.uid()) and private.can_see_conversation(conversation_id));

create policy "conversation_members: leave a group"
  on public.conversation_members for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c where c.id = conversation_id and c.kind = 'group'
    )
  );

create policy "messages: visible in the conversation"
  on public.messages for select to authenticated
  using (private.can_see_conversation(conversation_id));

create policy "messages: people who can post write"
  on public.messages for insert to authenticated
  with check (
    author_id = (select auth.uid()) and private.can_post_in_conversation(conversation_id)
  );

-- Authors edit and delete their own; moderators delete in the household chat
-- (the guard below keeps them from editing).
create policy "messages: authors, or moderators in the household chat, change"
  on public.messages for update to authenticated
  using (
    private.can_see_conversation(conversation_id)
    and (
      author_id = (select auth.uid())
      or (
        private.has_household_permission(household_id, 'moderate_content')
        and exists (
          select 1 from public.conversations c
          where c.id = conversation_id and c.kind = 'household'
        )
      )
    )
  )
  with check (private.can_see_conversation(conversation_id));

grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant update (title) on public.conversations to authenticated;
grant update (muted) on public.conversation_members to authenticated;
grant delete on public.conversation_members to authenticated;
-- household_id is accepted but set from the conversation by the guard.
grant insert (conversation_id, household_id, body, image_path, reply_to)
  on public.messages to authenticated;
grant update (body, deleted_at) on public.messages to authenticated;


-- ── 4. Guards ───────────────────────────────────────────────────────────────

create function private.guard_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    select c.household_id into new.household_id
    from public.conversations c where c.id = new.conversation_id;
    new.body := btrim(new.body);
    new.created_at := now();
    if new.reply_to is not null and not exists (
      select 1 from public.messages m
      where m.id = new.reply_to and m.conversation_id = new.conversation_id
    ) then
      raise exception 'You can only reply in the same conversation.' using errcode = '22023';
    end if;
    if new.image_path is not null
       and new.image_path not like new.household_id || '/chat/' || new.conversation_id || '/%' then
      raise exception 'That photo belongs somewhere else.' using errcode = '22023';
    end if;
    if (select count(*) from public.messages m
        where m.author_id = v_caller and m.created_at > now() - interval '1 minute') >= 60 then
      raise exception 'Slow down a little.' using errcode = '54000';
    end if;
    return new;
  end if;

  -- Deleting: the text and photo go, a "deleted" line stays.
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_at := now();
    new.body := '';
    new.image_path := null;
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was deleted.' using errcode = '22023';
  end if;
  if new.body is distinct from old.body then
    if old.author_id is distinct from v_caller then
      raise exception 'Only the author can edit a message.' using errcode = '42501';
    end if;
    new.body := btrim(new.body);
    new.edited_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.guard_message() from public, anon, authenticated;

create trigger messages_guard
  before insert or update on public.messages
  for each row execute function private.guard_message();


-- ── 5. Starting conversations ───────────────────────────────────────────────

-- The household chat, made with the household.
create function private.create_household_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversations (household_id, kind, created_by)
  values (new.id, 'household', null)
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.create_household_chat() from public, anon, authenticated;

create trigger households_create_chat
  after insert on public.households
  for each row execute function private.create_household_chat();

insert into public.conversations (household_id, kind, created_by)
select h.id, 'household', null from public.households h
on conflict do nothing;

-- A named group with the people chosen (and you).
create function public.start_group_chat(p_household_id uuid, p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
  v_members uuid[] := array(
    select distinct x from unnest(coalesce(p_member_ids, '{}')) x where x is distinct from (select auth.uid())
  );
begin
  if v_caller is null or not private.has_household_permission(p_household_id, 'create_posts') then
    raise exception 'You can''t start a conversation here.' using errcode = '42501';
  end if;
  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 80 then
    raise exception 'Give the group a name.' using errcode = '22023';
  end if;
  if cardinality(v_members) < 1 or cardinality(v_members) > 50 then
    raise exception 'Choose who''s in it.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_members) x
    where not exists (
      select 1 from public.household_members m
      where m.household_id = p_household_id and m.profile_id = x and m.status = 'active'
    )
  ) then
    raise exception 'Only members of this household can be in it.' using errcode = '22023';
  end if;
  if (select count(*) from public.conversations c where c.household_id = p_household_id) >= 500 then
    raise exception 'Conversation limit reached.' using errcode = '54000';
  end if;

  insert into public.conversations (household_id, kind, title, created_by)
  values (p_household_id, 'group', btrim(p_title), v_caller)
  returning id into v_id;
  insert into public.conversation_members (conversation_id, household_id, profile_id)
  select v_id, p_household_id, x from unnest(array_append(v_members, v_caller)) x;
  return v_id;
end;
$$;

-- The conversation between you and one other member (made the first time).
create function public.direct_chat(p_household_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
begin
  if v_caller is null
     or p_profile_id is null
     or p_profile_id = v_caller
     or not private.has_household_permission(p_household_id, 'create_posts')
     or not exists (
       select 1 from public.household_members m
       where m.household_id = p_household_id and m.profile_id = p_profile_id and m.status = 'active'
     ) then
    raise exception 'You can''t message this person here.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('direct' || p_household_id::text
    || least(v_caller, p_profile_id)::text || greatest(v_caller, p_profile_id)::text));
  select c.id into v_id
  from public.conversations c
  where c.household_id = p_household_id
    and c.kind = 'direct'
    and exists (select 1 from public.conversation_members a
                where a.conversation_id = c.id and a.profile_id = v_caller)
    and exists (select 1 from public.conversation_members b
                where b.conversation_id = c.id and b.profile_id = p_profile_id)
  limit 1;
  if v_id is null then
    insert into public.conversations (household_id, kind, created_by)
    values (p_household_id, 'direct', v_caller)
    returning id into v_id;
    insert into public.conversation_members (conversation_id, household_id, profile_id)
    values (v_id, p_household_id, v_caller), (v_id, p_household_id, p_profile_id);
  end if;
  return v_id;
end;
$$;

-- Marks a conversation read for you (and its notifications).
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_household uuid;
begin
  if v_caller is null or not private.can_see_conversation(p_conversation_id) then
    raise exception 'You can''t see this conversation.' using errcode = '42501';
  end if;
  select c.household_id into v_household from public.conversations c where c.id = p_conversation_id;
  insert into public.conversation_members (conversation_id, household_id, profile_id, last_read_at)
  values (p_conversation_id, v_household, v_caller, now())
  on conflict (conversation_id, profile_id) do update set last_read_at = now();
  update public.notifications n
  set read_at = now()
  where n.recipient_id = v_caller
    and n.kind = 'chat_message'
    and n.subject_id = p_conversation_id
    and n.read_at is null;
end;
$$;

-- Mutes or unmutes a conversation for you (no notifications while muted).
create function public.mute_conversation(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_household uuid;
begin
  if v_caller is null or p_muted is null or not private.can_see_conversation(p_conversation_id) then
    raise exception 'You can''t see this conversation.' using errcode = '42501';
  end if;
  select c.household_id into v_household from public.conversations c where c.id = p_conversation_id;
  insert into public.conversation_members (conversation_id, household_id, profile_id, muted)
  values (p_conversation_id, v_household, v_caller, p_muted)
  on conflict (conversation_id, profile_id) do update set muted = p_muted;
end;
$$;

revoke all on function public.start_group_chat(uuid, text, uuid[]) from public, anon;
revoke all on function public.direct_chat(uuid, uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.mute_conversation(uuid, boolean) from public, anon;
grant execute on function public.start_group_chat(uuid, text, uuid[]) to authenticated;
grant execute on function public.direct_chat(uuid, uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mute_conversation(uuid, boolean) to authenticated;


-- ── 6. After a message: notifications and live updates ──────────────────────

-- One unread notification per conversation per person, kept up to date
-- ("Maya in Holiday plans: See you at 5"), so chat never floods the inbox.
create function private.after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_author uuid := new.author_id;
  v_person uuid;
  v_title text;
  v_body text;
begin
  select * into v_conversation from public.conversations c where c.id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  -- The author has read their own message.
  insert into public.conversation_members (conversation_id, household_id, profile_id, last_read_at)
  values (new.conversation_id, new.household_id, v_author, now())
  on conflict (conversation_id, profile_id) do update set last_read_at = now();

  v_title := private.display_name(v_author) || case v_conversation.kind
    when 'household' then ' in the household chat'
    when 'group' then ' in ' || v_conversation.title
    else ''
  end;
  v_body := case when new.body = '' then 'Sent a photo' else left(new.body, 140) end;

  for v_person in select private.conversation_participants(new.conversation_id) loop
    continue when v_person = v_author;
    continue when exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = new.conversation_id and cm.profile_id = v_person and cm.muted
    );
    update public.notifications n
    set title = left(v_title, 200),
        body = v_body,
        actor_id = v_author,
        created_at = now(),
        push_claimed_at = null
    where n.recipient_id = v_person
      and n.kind = 'chat_message'
      and n.subject_id = new.conversation_id
      and n.read_at is null;
    if not found then
      perform private.notify(
        v_person, new.household_id, 'chat_message', new.conversation_id,
        v_title, v_body, 'chat/' || new.conversation_id
      );
    end if;
  end loop;
  return null;
end;
$$;

create function private.live_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid := case when tg_op = 'DELETE' then old.conversation_id else new.conversation_id end;
  v_household uuid := case when tg_op = 'DELETE' then old.household_id else new.household_id end;
  v_person uuid;
begin
  if exists (select 1 from public.conversations c where c.id = v_conversation and c.kind = 'household') then
    perform private.broadcast('household:' || v_household, 'chat');
  else
    for v_person in select private.conversation_participants(v_conversation) loop
      perform private.broadcast('profile:' || v_person, 'chat');
    end loop;
  end if;
  return null;
end;
$$;

create function private.live_conversation_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(
    'profile:' || case when tg_op = 'DELETE' then old.profile_id else new.profile_id end,
    'chat'
  );
  return null;
end;
$$;

-- Leaving a household takes you out of its conversations.
create function private.cleanup_departed_member_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.conversation_members cm
  where cm.household_id = old.household_id and cm.profile_id = old.profile_id;
  return old;
end;
$$;

revoke all on function private.after_message() from public, anon, authenticated;
revoke all on function private.live_messages() from public, anon, authenticated;
revoke all on function private.live_conversation_members() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member_chat() from public, anon, authenticated;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.after_message();
create trigger messages_live after insert or update or delete on public.messages
  for each row execute function private.live_messages();
create trigger conversation_members_live
  after insert or update of muted or delete on public.conversation_members
  for each row execute function private.live_conversation_members();
create trigger household_members_cleanup_chat after delete on public.household_members
  for each row execute function private.cleanup_departed_member_chat();


-- ── 7. Photos ───────────────────────────────────────────────────────────────

-- "<household>/chat/<conversation>/<file>" → the conversation, if the path is
-- well formed and the household matches.
create function private.chat_object_conversation(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_conversation uuid;
begin
  if cardinality(v_parts) <> 4
     or v_parts[2] <> 'chat'
     or v_parts[1] !~ v_uuid
     or v_parts[3] !~ v_uuid
     or v_parts[4] !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return null;
  end if;
  select c.id into v_conversation from public.conversations c
  where c.id = v_parts[3]::uuid and c.household_id = v_parts[1]::uuid;
  return v_conversation;
end;
$$;

-- Whether a message still shows this photo (deleting the message clears it).
create function private.chat_photo_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages m where m.image_path = p_name);
$$;

revoke all on function private.chat_object_conversation(text) from public, anon;
revoke all on function private.chat_photo_in_use(text) from public, anon;
grant execute on function private.chat_object_conversation(text) to authenticated;
grant execute on function private.chat_photo_in_use(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('household-media', 'household-media', false, 10485760,
            array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
    on conflict (id) do nothing;

    -- Only while a message shows it (or to the person who just uploaded it):
    -- a deleted message's photo is gone for everyone at once.
    create policy "household-media: chat photos for people in the conversation"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'household-media'
        and private.can_see_conversation(private.chat_object_conversation(name))
        and (owner_id = (select auth.uid())::text or private.chat_photo_in_use(name))
      );
    create policy "household-media: people who can post add chat photos"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'household-media'
        and private.can_post_in_conversation(private.chat_object_conversation(name))
      );
    create policy "household-media: you remove your own chat photos"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'household-media'
        and owner_id = (select auth.uid())::text
        and private.chat_object_conversation(name) is not null
      );
  end if;
end;
$$;


-- ── 8. The conversation list ────────────────────────────────────────────────

-- Conversations with their last message and how many are unread, newest
-- first. Runs as the caller (security invoker), so RLS decides what's in it.
create function public.chat_overview(p_household_id uuid)
returns table (
  conversation_id uuid,
  kind public.conversation_kind,
  title text,
  member_ids uuid[],
  muted boolean,
  unread bigint,
  last_body text,
  last_author uuid,
  last_has_image boolean,
  last_deleted boolean,
  last_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    c.title,
    case when c.kind = 'household' then '{}'::uuid[]
         else array(select cm.profile_id from public.conversation_members cm
                    where cm.conversation_id = c.id order by cm.joined_at) end,
    coalesce(mine.muted, false),
    (select count(*) from public.messages m
     where m.conversation_id = c.id
       and m.deleted_at is null
       and m.author_id is distinct from (select auth.uid())
       and m.created_at > coalesce(
         mine.last_read_at,
         (select hm.joined_at from public.household_members hm
          where hm.household_id = c.household_id and hm.profile_id = (select auth.uid())),
         '-infinity'::timestamptz
       )),
    last.body,
    last.author_id,
    last.image_path is not null,
    last.deleted_at is not null,
    last.created_at
  from public.conversations c
  left join public.conversation_members mine
    on mine.conversation_id = c.id and mine.profile_id = (select auth.uid())
  left join lateral (
    select m.body, m.author_id, m.image_path, m.deleted_at, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last on true
  where c.household_id = p_household_id
  order by coalesce(c.last_message_at, c.created_at) desc
  limit 500;
$$;

revoke all on function public.chat_overview(uuid) from public, anon;
grant execute on function public.chat_overview(uuid) to authenticated;
