alter table public.agent_projects
  add column if not exists file_storage_ready_at timestamptz;

update public.agent_projects
set file_storage_ready_at = coalesce(file_storage_ready_at, now())
where exists (
  select 1 from public.agent_project_files f
  where f.project_id = agent_projects.id
);

notify pgrst, 'reload schema';
