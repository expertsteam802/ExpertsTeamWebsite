update public.agent_projects p
set files = '{}'::jsonb
where p.file_storage_ready_at is not null
  and exists (
    select 1
    from public.agent_project_files f
    where f.project_id = p.id
      and f.user_id = p.user_id
  );
