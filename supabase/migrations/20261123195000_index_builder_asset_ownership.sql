create index if not exists agent_project_assets_user_id_idx on public.agent_project_assets(user_id);
create index if not exists agent_project_asset_staging_user_id_idx on public.agent_project_asset_staging(user_id);
create index if not exists agent_project_file_staging_user_id_idx on public.agent_project_file_staging(user_id);
