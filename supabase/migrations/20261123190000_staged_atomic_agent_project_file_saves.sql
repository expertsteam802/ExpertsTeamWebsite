create table if not exists public.agent_project_file_staging (
  import_id uuid not null,
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  content text not null,
  created_at timestamptz not null default now(),
  primary key (import_id, file_path)
);

create index if not exists agent_project_file_staging_project_idx
  on public.agent_project_file_staging (project_id, user_id, import_id);

alter table public.agent_project_file_staging enable row level security;

drop policy if exists "Project owners insert staged files" on public.agent_project_file_staging;
create policy "Project owners insert staged files"
  on public.agent_project_file_staging
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Project owners read staged files" on public.agent_project_file_staging;
create policy "Project owners read staged files"
  on public.agent_project_file_staging
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Project owners delete staged files" on public.agent_project_file_staging;
create policy "Project owners delete staged files"
  on public.agent_project_file_staging
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

create or replace function public.finalize_agent_project_file_staging(
  p_project_id uuid,
  p_import_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_file_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save project files.';
  end if;

  if not exists (
    select 1 from public.agent_projects p
    where p.id = p_project_id and p.user_id = v_user_id
  ) then
    raise exception 'Project not found or access denied.';
  end if;

  select count(*)::integer into v_file_count
  from public.agent_project_file_staging s
  where s.project_id = p_project_id
    and s.user_id = v_user_id
    and s.import_id = p_import_id;

  if v_file_count = 0 then
    raise exception 'No staged project files were found to finalize.';
  end if;

  delete from public.agent_project_files
  where project_id = p_project_id and user_id = v_user_id;

  insert into public.agent_project_files (
    project_id, user_id, file_path, content, updated_at
  )
  select
    p_project_id, v_user_id, s.file_path, s.content, now()
  from public.agent_project_file_staging s
  where s.project_id = p_project_id
    and s.user_id = v_user_id
    and s.import_id = p_import_id
  order by s.file_path;

  update public.agent_projects
  set files = '{}'::jsonb,
      file_storage_ready_at = now(),
      updated_at = now()
  where id = p_project_id and user_id = v_user_id;

  delete from public.agent_project_file_staging
  where project_id = p_project_id
    and user_id = v_user_id
    and import_id = p_import_id;

  return v_file_count;
end;
$$;

revoke all on function public.finalize_agent_project_file_staging(uuid, uuid) from public;
revoke all on function public.finalize_agent_project_file_staging(uuid, uuid) from anon;
grant execute on function public.finalize_agent_project_file_staging(uuid, uuid) to authenticated;

comment on table public.agent_project_file_staging
is 'Temporary batched file uploads used to atomically replace a Builder project file tree.';
comment on function public.finalize_agent_project_file_staging(uuid, uuid)
is 'Atomically swaps staged Builder project files into the live file table for the authenticated project owner.';
