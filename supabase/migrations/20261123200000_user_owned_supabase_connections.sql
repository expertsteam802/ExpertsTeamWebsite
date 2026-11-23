create table if not exists public.user_cloud_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'supabase' check (provider = 'supabase'),
  display_name text not null,
  project_url text not null,
  project_ref text not null,
  publishable_key text not null,
  secret_id uuid,
  status text not null default 'connected' check (status in ('connected','needs_attention')),
  tested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_url),
  unique (id, user_id)
);

create index if not exists user_cloud_connections_user_id_idx
  on public.user_cloud_connections(user_id);

alter table public.user_cloud_connections enable row level security;

drop policy if exists "Users can read their own cloud connections" on public.user_cloud_connections;
create policy "Users can read their own cloud connections"
  on public.user_cloud_connections for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_cloud_connections from anon, authenticated;
grant select on public.user_cloud_connections to authenticated;

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

  select id, secret_id into v_id, v_old_secret_id
  from public.user_cloud_connections
  where user_id = v_user_id and project_url = rtrim(p_project_url, '/')
  for update;

  if p_secret_key is not null and trim(p_secret_key) <> '' then
    v_new_secret_id := vault.create_secret(
      trim(p_secret_key),
      'user-cloud-' || v_user_id::text || '-' || coalesce(v_id::text, gen_random_uuid()::text),
      'Server-side Supabase credential owned by an ExpertsTeam user'
    );
  end if;

  if v_old_secret_id is not null then delete from vault.secrets where id = v_old_secret_id; end if;

  insert into public.user_cloud_connections (
    user_id, display_name, project_url, project_ref, publishable_key, secret_id, status, tested_at, updated_at
  ) values (
    v_user_id, coalesce(v_display_name, p_project_ref), rtrim(p_project_url, '/'),
    p_project_ref, p_publishable_key, v_new_secret_id, 'connected', now(), now()
  )
  on conflict (user_id, project_url) do update set
    display_name = excluded.display_name,
    project_ref = excluded.project_ref,
    publishable_key = excluded.publishable_key,
    secret_id = excluded.secret_id,
    status = 'connected',
    tested_at = now(),
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'display_name', coalesce(v_display_name, p_project_ref),
    'project_url', rtrim(p_project_url, '/'), 'project_ref', p_project_ref,
    'has_secret', v_new_secret_id is not null, 'status', 'connected');
end;
$$;

create or replace function public.delete_user_supabase_connection(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_secret_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select secret_id into v_secret_id from public.user_cloud_connections
  where id = p_connection_id and user_id = v_user_id for update;
  if not found then return false; end if;
  if v_secret_id is not null then delete from vault.secrets where id = v_secret_id; end if;
  delete from public.user_cloud_connections where id = p_connection_id and user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.save_user_supabase_connection(text,text,text,text,text) from public, anon;
revoke all on function public.delete_user_supabase_connection(uuid) from public, anon;
grant execute on function public.save_user_supabase_connection(text,text,text,text,text) to authenticated;
grant execute on function public.delete_user_supabase_connection(uuid) to authenticated;
