create table if not exists public.agent_project_files (
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  content text not null default '',
  byte_size bigint generated always as (octet_length(content)::bigint) stored,
  updated_at timestamptz not null default now(),
  primary key (project_id, file_path),
  constraint agent_project_files_path_valid check (
    length(file_path) between 1 and 1024
    and file_path !~ '(^/|\\\\|(^|/)\\.\\.?(/|$)|(^|/)\\.env($|\\.)|(^|/)node_modules(/|$)|(^|/)\\.git(/|$))'
  )
);
create index if not exists idx_agent_project_files_user_project
  on public.agent_project_files(user_id, project_id);
alter table public.agent_project_files enable row level security;
drop policy if exists "Project owners read project files" on public.agent_project_files;
create policy "Project owners read project files"
  on public.agent_project_files for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = agent_project_files.project_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "Project owners insert project files" on public.agent_project_files;
create policy "Project owners insert project files"
  on public.agent_project_files for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = agent_project_files.project_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "Project owners update project files" on public.agent_project_files;
create policy "Project owners update project files"
  on public.agent_project_files for update to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = agent_project_files.project_id and p.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = agent_project_files.project_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "Project owners delete project files" on public.agent_project_files;
create policy "Project owners delete project files"
  on public.agent_project_files for delete to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = agent_project_files.project_id and p.user_id = (select auth.uid())
  ));
grant select, insert, update, delete on public.agent_project_files to authenticated;
insert into public.agent_project_files(project_id, user_id, file_path, content)
select p.id, p.user_id, entry.key, entry.value
from public.agent_projects p
cross join lateral jsonb_each_text(
  case when jsonb_typeof(p.files) = 'object' then p.files else '{}'::jsonb end
) as entry
where entry.key <> ''
on conflict (project_id, file_path) do nothing;
notify pgrst, 'reload schema';
