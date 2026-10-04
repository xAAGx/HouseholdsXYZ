-- ============================================================================
-- Households.xyz: document vault
-- ============================================================================
-- Passports, insurance, school forms… Documents have the same audiences as
-- lists and events, never wider than the household:
--   household         members who can see documents (view_documents: adults
--                     and admins by default; not children, caregivers or guests)
--   selected_members  the creator and the people chosen (a teen can be given
--                     their own passport scan)
--   private           only the creator
-- `people` says whose document it is (Leo's passport); it doesn't show it to
-- them. Files sit in the private household-documents bucket under
-- <household>/documents/<document>/<file>: only people who can see the
-- document open them (short-lived signed links), only people who can change
-- it add or remove them. Expiry reminders go out some days before, and on
-- the day.
-- ============================================================================


-- ── 1. Tables ───────────────────────────────────────────────────────────────

alter type public.notification_kind add value if not exists 'document_expiring';

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null default 'Other' check (char_length(btrim(category)) between 1 and 40),
  -- A policy or document number, if useful.
  reference text check (char_length(reference) <= 80),
  notes text check (char_length(notes) <= 2000),
  people uuid[] not null default '{}' check (cardinality(people) <= 20),
  expires_on date,
  -- Days before it expires to remind (0: only on the day).
  remind_days smallint not null default 30 check (remind_days between 0 and 365),
  visibility public.content_visibility not null default 'household'
    check (visibility in ('private', 'selected_members', 'household')),
  shared_with uuid[] not null default '{}' check (cardinality(shared_with) <= 100),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create index documents_household_idx on public.documents (household_id, title);
create index documents_expiry_idx on public.documents (expires_on) where expires_on is not null;
create index documents_created_by_idx on public.documents (created_by);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  household_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  )),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (document_id, household_id)
    references public.documents (id, household_id) on delete cascade
);

create index document_files_document_idx on public.document_files (document_id);
create index document_files_household_idx on public.document_files (household_id);
create index document_files_created_by_idx on public.document_files (created_by);

create trigger documents_set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();

alter table public.documents enable row level security;
alter table public.document_files enable row level security;
revoke all on public.documents, public.document_files from anon, authenticated;


-- ── 2. Who can see and change a document ────────────────────────────────────

create function private.can_see_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and private.is_household_member(d.household_id)
      and (
        (d.visibility = 'household' and private.has_household_permission(d.household_id, 'view_documents'))
        or d.created_by = (select auth.uid())
        or (d.visibility = 'selected_members' and (select auth.uid()) = any (d.shared_with))
      )
  );
$$;

create function private.can_edit_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and private.is_household_member(d.household_id)
      and (
        d.created_by = (select auth.uid())
        or (d.visibility = 'household'
            and private.has_household_permission(d.household_id, 'manage_documents'))
      )
  );
$$;

-- The same question for someone else (who to remind).
create function private.profile_can_see_document(p_profile_id uuid, p_document public.documents)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_document.household_id
      and m.profile_id = p_profile_id
      and m.status = 'active'
  )
  and (
    (p_document.visibility = 'household'
     and private.member_has_permission(p_profile_id, p_document.household_id, 'view_documents'))
    or p_document.created_by = p_profile_id
    or (p_document.visibility = 'selected_members' and p_profile_id = any (p_document.shared_with))
  );
$$;

revoke all on function private.can_see_document(uuid) from public, anon;
revoke all on function private.can_edit_document(uuid) from public, anon;
revoke all on function private.profile_can_see_document(uuid, public.documents)
  from public, anon, authenticated;
grant execute on function private.can_see_document(uuid) to authenticated;
grant execute on function private.can_edit_document(uuid) to authenticated;


-- ── 3. Guards ───────────────────────────────────────────────────────────────

create function private.guard_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and v_caller is not null
     and old.created_by is distinct from v_caller
     and (new.visibility is distinct from old.visibility
          or new.shared_with is distinct from old.shared_with) then
    raise exception 'Only the person who added it can change who sees it.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT'
     and (select count(*) from public.documents d where d.household_id = new.household_id) >= 2000 then
    raise exception 'Document limit reached.' using errcode = '54000';
  end if;

  if new.visibility <> 'selected_members' then
    new.shared_with := '{}';
  end if;
  new.shared_with := array(
    select distinct s from unnest(new.shared_with) s where s is distinct from new.created_by
  );
  if (select count(distinct x) from unnest(new.people) x) <> cardinality(new.people) then
    raise exception 'Choose each person once.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(new.shared_with || new.people) x
    where not exists (
      select 1 from public.household_members m
      where m.household_id = new.household_id and m.profile_id = x and m.status = 'active'
    )
  ) then
    raise exception 'Only members of this household can be on it.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create function private.guard_document_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select d.household_id into new.household_id from public.documents d where d.id = new.document_id;
  if new.storage_path not like new.household_id || '/documents/' || new.document_id || '/%' then
    raise exception 'That file belongs somewhere else.' using errcode = '22023';
  end if;
  if (select count(*) from public.document_files f where f.document_id = new.document_id) >= 20 then
    raise exception 'A document can have up to 20 files.' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_document() from public, anon, authenticated;
revoke all on function private.guard_document_file() from public, anon, authenticated;

create trigger documents_guard before insert or update on public.documents
  for each row execute function private.guard_document();
create trigger document_files_guard before insert on public.document_files
  for each row execute function private.guard_document_file();


-- ── 4. Policies & grants ────────────────────────────────────────────────────

create policy "documents: the people they're shared with"
  on public.documents for select to authenticated
  using (
    private.is_household_member(household_id)
    and (
      (visibility = 'household' and private.has_household_permission(household_id, 'view_documents'))
      or created_by = (select auth.uid())
      or (visibility = 'selected_members' and (select auth.uid()) = any (shared_with))
    )
  );

create policy "documents: people who can see documents add them"
  on public.documents for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_household_permission(household_id, 'view_documents')
  );

create policy "documents: the creator or document managers change"
  on public.documents for update to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'manage_documents'))
    )
  )
  with check (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'manage_documents'))
    )
  );

create policy "documents: the creator or document managers delete"
  on public.documents for delete to authenticated
  using (
    private.is_household_member(household_id)
    and (
      created_by = (select auth.uid())
      or (visibility = 'household' and private.has_household_permission(household_id, 'manage_documents'))
    )
  );

create policy "document_files: with the document"
  on public.document_files for select to authenticated
  using (private.can_see_document(document_id));

create policy "document_files: people who can change the document add"
  on public.document_files for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_edit_document(document_id));

create policy "document_files: people who can change the document remove"
  on public.document_files for delete to authenticated
  using (private.can_edit_document(document_id));

grant select on public.documents, public.document_files to authenticated;
grant insert (
  household_id, title, category, reference, notes, people, expires_on, remind_days,
  visibility, shared_with
) on public.documents to authenticated;
grant update (
  title, category, reference, notes, people, expires_on, remind_days, visibility, shared_with
) on public.documents to authenticated;
grant delete on public.documents to authenticated;
-- household_id is accepted but set from the document by the guard.
grant insert (document_id, household_id, storage_path, file_name, mime_type, size_bytes)
  on public.document_files to authenticated;
grant delete on public.document_files to authenticated;


-- ── 5. Files in storage ─────────────────────────────────────────────────────

-- "<household>/documents/<document>/<file>" → the document, if well formed
-- and the household matches.
create function private.document_object_document(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_document uuid;
begin
  if cardinality(v_parts) <> 4
     or v_parts[2] <> 'documents'
     or v_parts[1] !~ v_uuid
     or v_parts[3] !~ v_uuid
     or v_parts[4] !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return null;
  end if;
  select d.id into v_document from public.documents d
  where d.id = v_parts[3]::uuid and d.household_id = v_parts[1]::uuid;
  return v_document;
end;
$$;

revoke all on function private.document_object_document(text) from public, anon;
grant execute on function private.document_object_document(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('household-documents', 'household-documents', false, 20971520,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;

    create policy "household-documents: people who can see the document"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'household-documents'
        and private.can_see_document(private.document_object_document(name))
      );
    create policy "household-documents: document editors add files"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'household-documents'
        and private.can_edit_document(private.document_object_document(name))
      );
    create policy "household-documents: document editors remove files"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'household-documents'
        and private.can_edit_document(private.document_object_document(name))
      );
  end if;
end;
$$;


-- ── 6. Live updates, leaving, reminders ─────────────────────────────────────

create function private.live_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents;
  v_person uuid;
begin
  if tg_table_name = 'documents' then
    v_document := case when tg_op = 'DELETE' then old else new end;
  else
    select * into v_document from public.documents d
    where d.id = case when tg_op = 'DELETE' then old.document_id else new.document_id end;
    if not found then
      return null;
    end if;
  end if;
  if v_document.visibility = 'household' then
    perform private.broadcast_to_permission(v_document.household_id, 'view_documents', 'documents');
  end if;
  for v_person in
    select unnest(array_append(v_document.shared_with, v_document.created_by))
  loop
    perform private.broadcast('profile:' || v_person, 'documents');
  end loop;
  return null;
end;
$$;

-- Leaving takes your private documents with you and takes you off the rest.
-- (Their files stay unreachable in storage: no document, no access.)
create function private.cleanup_departed_member_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;
  delete from public.documents d
  where d.household_id = old.household_id
    and d.created_by = old.profile_id
    and d.visibility = 'private';
  update public.documents d
  set shared_with = array_remove(d.shared_with, old.profile_id),
      people = array_remove(d.people, old.profile_id)
  where d.household_id = old.household_id
    and (old.profile_id = any (d.shared_with) or old.profile_id = any (d.people));
  return old;
end;
$$;

-- "Expires soon: Leo's passport", some days before and on the day (09:00 at
-- home), to whoever added it and the people it's for who can see it.
create function private.remind_documents(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents;
  v_zone text;
  v_when date;
  v_person uuid;
begin
  for v_document in select d.* from public.documents d where d.expires_on is not null loop
    v_zone := private.household_time_zone(v_document.household_id);
    foreach v_when in array array[v_document.expires_on - v_document.remind_days, v_document.expires_on] loop
      continue when ((v_when + time '09:00') at time zone v_zone) <= p_from
        or ((v_when + time '09:00') at time zone v_zone) > p_to;
      continue when not private.claim_reminder(
        'document:' || v_document.id || ':' || v_document.expires_on || ':' || v_when
      );
      for v_person in
        select distinct x from unnest(array_append(v_document.people, v_document.created_by)) x
        where x is not null and private.profile_can_see_document(x, v_document)
      loop
        perform private.notify_system(
          v_person, v_document.household_id, 'document_expiring', v_document.id,
          case when v_when = v_document.expires_on then 'Expires today: ' else 'Expires soon: ' end
            || v_document.title,
          'On ' || to_char(v_document.expires_on, 'Dy, Mon FMDD, YYYY'),
          'documents'
        );
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function private.live_documents() from public, anon, authenticated;
revoke all on function private.cleanup_departed_member_documents() from public, anon, authenticated;
revoke all on function private.remind_documents(timestamptz, timestamptz) from public, anon, authenticated;

create trigger documents_live after insert or update or delete on public.documents
  for each row execute function private.live_documents();
create trigger document_files_live after insert or delete on public.document_files
  for each row execute function private.live_documents();
create trigger household_members_cleanup_documents after delete on public.household_members
  for each row execute function private.cleanup_departed_member_documents();

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
  perform private.remind_documents(v_from, v_to);
  perform private.pay_allowances();

  update private.scheduler_state set last_run = v_to;
  delete from private.sent_reminders r where r.sent_at < now() - interval '40 days';

  perform private.push_system_notifications();
  perform private.process_push_responses();
end;
$$;
