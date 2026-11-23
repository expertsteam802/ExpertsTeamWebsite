create or replace function public.get_user_supabase_connection_secret(
  p_connection_id uuid, p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if coalesce(
    current_setting('request.jwt.claim.role', true),
    auth.jwt() ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select jsonb_build_object('project_url', c.project_url, 'project_ref', c.project_ref,
    'publishable_key', c.publishable_key, 'secret_key', coalesce(s.decrypted_secret, ''))
  into v_result
  from public.user_cloud_connections c
  left join vault.decrypted_secrets s on s.id = c.secret_id
  where c.id = p_connection_id and c.user_id = p_user_id;
  return v_result;
end;
$$;
revoke all on function public.get_user_supabase_connection_secret(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_user_supabase_connection_secret(uuid,uuid) to service_role;
