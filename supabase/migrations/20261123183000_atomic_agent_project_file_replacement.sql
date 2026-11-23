create or replace function public.replace_agent_project_files(
  p_project_id uuid,
  p_files jsonb
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

  if p_files is null or jsonb_typeof(p_files) <> 'object' then
    raise exception 'Project files must be a JSON object.';
  end if;

  update public.agent_projects
  set files = p_files,
      file_storage_ready_at = now(),
      updated_at = now()
  where id = p_project_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Project not found or access denied.';
  end if;

  delete from public.agent_project_files
  where project_id = p_project_id
    and user_id = v_user_id;

  insert into public.agent_project_files (
    project_id,
    user_id,
    file_path,
    content,
    updated_at
  )
  select
    p_project_id,
    v_user_id,
    entry.key,
    entry.value,
    now()
  from jsonb_each_text(p_files) as entry;

  get diagnostics v_file_count = row_count;
  return v_file_count;
end;
$$;

revoke all on function public.replace_agent_project_files(uuid, jsonb) from public;
revoke all on function public.replace_agent_project_files(uuid, jsonb) from anon;
grant execute on function public.replace_agent_project_files(uuid, jsonb) to authenticated;

comment on function public.replace_agent_project_files(uuid, jsonb)
is 'Atomically replaces a project file tree for its authenticated owner while retaining a recovery snapshot.';
