create or replace function public.store_plugin_oauth_connection(
 p_user_id uuid,p_provider text,p_display_name text,p_provider_account_id text,p_provider_username text,p_scopes text[],p_token_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old_secret_id uuid; v_secret_id uuid; v_connection_id uuid;
begin
 if p_provider not in ('github','supabase') then raise exception 'Unsupported OAuth provider'; end if;
 if p_user_id is null or p_provider_account_id is null or length(p_provider_account_id)>200 then raise exception 'Invalid OAuth connection identity'; end if;
 select id,secret_id into v_connection_id,v_old_secret_id from public.user_plugin_connections where user_id=p_user_id and provider=p_provider and provider_account_id=p_provider_account_id for update;
 v_secret_id:=vault.create_secret(p_token_payload::text,'plugin-'||p_provider||'-'||p_user_id::text||'-'||p_provider_account_id,'Encrypted OAuth credentials for ExpertsTeam plugin connection');
 if v_old_secret_id is not null then delete from vault.secrets where id=v_old_secret_id; end if;
 insert into public.user_plugin_connections(user_id,provider,display_name,provider_account_id,provider_username,scopes,secret_id,status,connected_at,updated_at)
 values(p_user_id,p_provider,left(p_display_name,120),p_provider_account_id,nullif(left(p_provider_username,100),''),coalesce(p_scopes,'{}'),v_secret_id,'connected',now(),now())
 on conflict(user_id,provider,provider_account_id) do update set display_name=excluded.display_name,provider_username=excluded.provider_username,scopes=excluded.scopes,secret_id=excluded.secret_id,status='connected',connected_at=now(),updated_at=now()
 returning id into v_connection_id;
 return v_connection_id;
end; $$;
revoke all on function public.store_plugin_oauth_connection(uuid,text,text,text,text,text[],jsonb) from public,anon,authenticated;
grant execute on function public.store_plugin_oauth_connection(uuid,text,text,text,text,text[],jsonb) to service_role;
create or replace function public.delete_user_plugin_connection(p_connection_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_secret_id uuid;
begin
 select secret_id into v_secret_id from public.user_plugin_connections where id=p_connection_id and user_id=p_user_id for update;
 if not found then return false; end if;
 if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;
 delete from public.user_plugin_connections where id=p_connection_id and user_id=p_user_id;
 return true;
end; $$;
revoke all on function public.delete_user_plugin_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_user_plugin_connection(uuid,uuid) to service_role;
