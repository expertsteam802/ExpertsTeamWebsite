alter table public.workspace_messages
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint not null default 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-media',
  'workspace-media',
  false,
  8388608,
  array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = excluded.allowed_mime_types;

create policy workspace_media_select_members
  on storage.objects for select to authenticated
  using (
    bucket_id = 'workspace-media'
    and public.is_workspace_member((select auth.uid()))
  );
create policy workspace_media_insert_members
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'workspace-media'
    and (storage.foldername(name))[1] = (select (auth.uid())::text)
    and public.is_workspace_member((select auth.uid()))
  );
create policy workspace_media_delete_owner_or_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'workspace-media'
    and (
      (storage.foldername(name))[1] = (select (auth.uid())::text)
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
    )
    and public.is_workspace_member((select auth.uid()))
  );
