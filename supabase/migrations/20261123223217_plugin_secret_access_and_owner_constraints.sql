alter table public.user_plugin_connections add constraint user_plugin_connections_id_user_unique unique (id,user_id);
alter table public.user_plugin_permissions drop constraint if exists user_plugin_permissions_connection_id_fkey;
alter table public.user_plugin_permissions add constraint user_plugin_permissions_connection_owner_fkey foreign key(connection_id,user_id) references public.user_plugin_connections(id,user_id) on delete cascade;
alter table public.plugin_audit_logs drop constraint if exists plugin_audit_logs_connection_id_fkey;
alter table public.plugin_audit_logs add constraint plugin_audit_logs_connection_owner_fkey foreign key(connection_id,user_id) references public.user_plugin_connections(id,user_id) on delete set null;
create or replace function public.get_user_plugin_connection_secret(p_connection_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
 select jsonb_build_object('provider',c.provider,'provider_account_id',c.provider_account_id,'provider_username',c.provider_username,'scopes',c.scopes,'token_payload',s.decrypted_secret::jsonb)
 into v_result from public.user_plugin_connections c left join vault.decrypted_secrets s on s.id=c.secret_id
 where c.id=p_connection_id and c.user_id=p_user_id and c.status='connected';
 return v_result;
end; $$;
revoke all on function public.get_user_plugin_connection_secret(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_user_plugin_connection_secret(uuid,uuid) to service_role;
