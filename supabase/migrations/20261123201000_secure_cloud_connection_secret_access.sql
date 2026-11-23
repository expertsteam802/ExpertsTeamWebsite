create or replace function public.save_user_supabase_connection(
  p_display_name text,
  p_project_url text,
  p_project_ref text,
  p_publishable_key text,
  p_secret_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_old_secret_id uuid;
  v_new_secret_id uuid;
  v_display_name text := left(nullif(trim(p_display_name), ''), 80);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/?$' then raise exception 'Use your HTTPS Supabase project URL'; end if;
  if length(p_project_ref) < 3 or length(p_project_ref) > 64 then raise exception 'Invalid Supabase project reference'; end if;
  if length(p_publishable_key) < 20 or length(p_publishable_key) > 1000 then raise exception 'Invalid publishable/anon key'; end if;
  if p_secret_key is not null and length(p_secret_key) > 2000 then raise exception 'Secret key is too long'; end if;
  select id, secret_id into v_id, v_old_secret_id from public.user_cloud_connections
    where user_id = v_user_id and project_url = rtrim(p_project_url, '/') for update;
  if p_secret_key is not null and trim(p_secret_key) <> '' then
    v_new_secret_id := vault.create_secret(trim(p_secret_key),
      'user-cloud-' || v_user_id::text || '-' || gen_random_uuid()::text,
      'Server-side Supabase credential owned by an ExpertsTeam user');
  end if;
  if v_old_secret_id is not null then delete from vault.secrets where id = v_old_secret_id; end if;
  insert into public.user_cloud_connections (
    user_id, display_name, project_url, project_ref, publishable_key, secret_id, status, tested_at, updated_at
  ) values (v_user_id, coalesce(v_display_name, p_project_ref), rtrim(p_project_url, '/'),
    p_project_ref, p_publishable_key, v_new_secret_id, 'connected', now(), now())
  on conflict (user_id, project_url) do update set display_name = excluded.display_name,
    project_ref = excluded.project_ref, publishable_key = excluded.publishable_key,
    secret_id = excluded.secret_id, status = 'connected', tested_at = now(), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'display_name', coalesce(v_display_name, p_project_ref),
    'project_url', rtrim(p_project_url, '/'), 'project_ref', p_project_ref,
    'has_secret', v_new_secret_id is not null, 'status', 'connected');
end;
$$;

create or replace function public.get_user_supabase_connection_secret(
  p_connection_id uuid, p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
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
