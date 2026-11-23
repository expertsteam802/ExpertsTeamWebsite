drop policy if exists "Project owners insert binary assets" on public.agent_project_assets;
create policy "Project owners insert binary assets" on public.agent_project_assets
for insert to authenticated with check (user_id = (select auth.uid()) and exists (
  select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
));
drop policy if exists "Project owners delete binary assets" on public.agent_project_assets;
create policy "Project owners delete binary assets" on public.agent_project_assets
for delete to authenticated using (user_id = (select auth.uid()) and exists (
  select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
));
create or replace function public.finalize_agent_project_workspace_staging(p_project_id uuid, p_import_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
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
