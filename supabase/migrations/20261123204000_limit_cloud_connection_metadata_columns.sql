revoke select on table public.user_cloud_connections from authenticated;
grant select (
  id, provider, display_name, project_url, project_ref, status, tested_at, created_at, updated_at
) on table public.user_cloud_connections to authenticated;
