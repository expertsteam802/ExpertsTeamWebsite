alter table public.plugin_audit_logs drop constraint if exists plugin_audit_logs_connection_owner_fkey;
alter table public.plugin_audit_logs add constraint plugin_audit_logs_connection_id_fkey foreign key (connection_id) references public.user_plugin_connections(id) on delete set null;
