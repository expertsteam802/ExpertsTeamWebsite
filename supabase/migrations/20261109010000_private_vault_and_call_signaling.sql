-- Private member Vault and authenticated WebRTC call signaling.
-- Existing public community uploads remain unchanged.
create table if not exists public.vault_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists vault_files_owner_created_idx
  on public.vault_files(user_id, created_at desc);

alter table public.vault_files enable row level security;
revoke all on public.vault_files from anon, public;
grant select, insert, delete on public.vault_files to authenticated;

drop policy if exists "Members manage only their Vault metadata" on public.vault_files;
create policy "Members manage only their Vault metadata"
  on public.vault_files for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets(id, name, public, file_size_limit)
values ('private-vault', 'private-vault', false, 209715200)
on conflict (id) do update
set public = false, file_size_limit = 209715200;

drop policy if exists "Vault owners read private objects" on storage.objects;
create policy "Vault owners read private objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'private-vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Vault owners upload private objects" on storage.objects;
create policy "Vault owners upload private objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'private-vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Vault owners delete private objects" on storage.objects;
create policy "Vault owners delete private objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'private-vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Private Realtime call signaling is limited to members of the conversation.
drop policy if exists "Conversation members receive call signals" on realtime.messages;
create policy "Conversation members receive call signals"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() ~ '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and private.is_direct_conversation_member(
      split_part(realtime.topic(), ':', 2)::uuid
    )
  );

drop policy if exists "Conversation members send call signals" on realtime.messages;
create policy "Conversation members send call signals"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.payload ->> 'sender_id' = (select auth.uid())::text
    and realtime.topic() ~ '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and private.is_direct_conversation_member(
      split_part(realtime.topic(), ':', 2)::uuid
    )
  );

-- Extend (rather than replace) the current direct-message MIME allowlist.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type)
  from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array[
    'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4',
    'audio/mpeg', 'audio/ogg', 'audio/wav'
  ]) as mime_type
)
where id = 'direct-messages';
