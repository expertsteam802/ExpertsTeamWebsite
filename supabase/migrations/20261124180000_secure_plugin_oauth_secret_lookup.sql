create or replace function public.get_user_plugin_oauth_secret(p_user_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_payload jsonb;
begin
  if p_user_id is null or p_provider not in ('github', 'supabase') then
    raise exception 'Invalid plugin credential request';
  end if;

  select secret_id
    into v_secret_id
    from public.user_plugin_connections
   where user_id = p_user_id
     and provider = p_provider
     and status = 'connected'
   order by updated_at desc
   limit 1;

  if v_secret_id is null then
    raise exception 'No connected OAuth account was found for this provider';
  end if;

  select decrypted_secret::jsonb
    into v_payload
    from vault.decrypted_secrets
   where id = v_secret_id;

  if v_payload is null then
    raise exception 'The encrypted OAuth credential could not be decrypted';
  end if;

  return v_payload;
end;
$$;

revoke all on function public.get_user_plugin_oauth_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.get_user_plugin_oauth_secret(uuid, text) to service_role;
