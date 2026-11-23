revoke delete on public.user_plugin_connections from authenticated;
drop policy if exists "Users can revoke their own plugin connections" on public.user_plugin_connections;
alter table public.user_plugin_permissions drop constraint if exists user_plugin_permissions_user_id_connection_id_project_id_key;
alter table public.user_plugin_permissions add constraint user_plugin_permissions_scope_unique unique nulls not distinct (user_id,connection_id,project_id);
