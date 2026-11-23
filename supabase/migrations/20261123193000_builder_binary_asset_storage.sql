insert into storage.buckets (id, name, public, file_size_limit)
values ('builder-project-assets', 'builder-project-assets', false, null)
on conflict (id) do update set public = false;

create table if not exists public.agent_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  updated_at timestamptz not null default now(),
  unique (project_id, file_path)
);
create index if not exists agent_project_assets_project_idx on public.agent_project_assets(project_id, user_id);

create table if not exists public.agent_project_asset_staging (
  import_id uuid not null,
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  created_at timestamptz not null default now(),
  primary key (import_id, file_path)
);
create index if not exists agent_project_asset_staging_project_idx on public.agent_project_asset_staging(project_id, user_id, import_id);

alter table public.agent_project_assets enable row level security;
alter table public.agent_project_asset_staging enable row level security;

create policy "Project owners read binary assets" on public.agent_project_assets
for select to authenticated using (user_id = (select auth.uid()) and exists (
  select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
));
create policy "Project owners insert binary asset staging" on public.agent_project_asset_staging
for insert to authenticated with check (user_id = (select auth.uid()) and exists (
  select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
));
create policy "Project owners read binary asset staging" on public.agent_project_asset_staging
for select to authenticated using (user_id = (select auth.uid()) and exists (
  select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
));
create policy "Project owners delete binary asset staging" on public.agent_project_asset_staging
for delete to authenticated using (user_id = (select auth.uid()) and exists (
  select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
));

create policy "Builder asset owners read objects" on storage.objects
for select to authenticated using (bucket_id = 'builder-project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Builder asset owners insert objects" on storage.objects
for insert to authenticated with check (bucket_id = 'builder-project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Builder asset owners update objects" on storage.objects
for update to authenticated using (bucket_id = 'builder-project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'builder-project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Builder asset owners delete objects" on storage.objects
for delete to authenticated using (bucket_id = 'builder-project-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));

create or replace function public.finalize_agent_project_workspace_staging(p_project_id uuid, p_import_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_text_count integer := 0; v_asset_count integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication is required to save project files.'; end if;
  if not exists (select 1 from public.agent_projects p where p.id = p_project_id and p.user_id = v_user_id) then raise exception 'Project not found or access denied.'; end if;
  select count(*)::integer into v_text_count from public.agent_project_file_staging s where s.project_id = p_project_id and s.user_id = v_user_id and s.import_id = p_import_id;
  select count(*)::integer into v_asset_count from public.agent_project_asset_staging s where s.project_id = p_project_id and s.user_id = v_user_id and s.import_id = p_import_id;
  if v_text_count + v_asset_count = 0 then raise exception 'No staged project files or assets were found to finalize.'; end if;
  delete from public.agent_project_files where project_id = p_project_id and user_id = v_user_id;
  insert into public.agent_project_files(project_id, user_id, file_path, content, updated_at)
    select p_project_id, v_user_id, s.file_path, s.content, now() from public.agent_project_file_staging s
    where s.project_id = p_project_id and s.user_id = v_user_id and s.import_id = p_import_id order by s.file_path;
  delete from public.agent_project_assets where project_id = p_project_id and user_id = v_user_id;
  insert into public.agent_project_assets(project_id, user_id, file_path, storage_path, mime_type, size_bytes, sha256, updated_at)
    select p_project_id, v_user_id, s.file_path, s.storage_path, s.mime_type, s.size_bytes, s.sha256, now() from public.agent_project_asset_staging s
    where s.project_id = p_project_id and s.user_id = v_user_id and s.import_id = p_import_id order by s.file_path;
  update public.agent_projects set files = '{}'::jsonb, file_storage_ready_at = now(), updated_at = now() where id = p_project_id and user_id = v_user_id;
  delete from public.agent_project_file_staging where project_id = p_project_id and user_id = v_user_id and import_id = p_import_id;
  delete from public.agent_project_asset_staging where project_id = p_project_id and user_id = v_user_id and import_id = p_import_id;
  return jsonb_build_object('textFiles', v_text_count, 'binaryAssets', v_asset_count);
end; $$;
revoke all on function public.finalize_agent_project_workspace_staging(uuid, uuid) from public, anon;
grant execute on function public.finalize_agent_project_workspace_staging(uuid, uuid) to authenticated;
comment on table public.agent_project_assets is 'Private binary assets belonging to Builder projects in the private builder-project-assets bucket.';
comment on table public.agent_project_asset_staging is 'Temporary metadata for binary assets uploaded during atomic Builder workspace synchronization.';
