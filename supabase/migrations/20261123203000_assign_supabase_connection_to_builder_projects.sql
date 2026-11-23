alter table public.agent_projects
  add column if not exists cloud_connection_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_projects_cloud_connection_owner_fkey'
      and conrelid = 'public.agent_projects'::regclass
  ) then
    alter table public.agent_projects
      add constraint agent_projects_cloud_connection_owner_fkey
      foreign key (cloud_connection_id, user_id)
      references public.user_cloud_connections(id, user_id)
      on delete restrict;
  end if;
end $$;

create index if not exists agent_projects_cloud_connection_id_idx
  on public.agent_projects(cloud_connection_id)
  where cloud_connection_id is not null;

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
  select secret_id into v_secret_id
  from public.user_cloud_connections
  where id = p_connection_id and user_id = v_user_id
  for update;
  if not found then return false; end if;
  update public.agent_projects
  set cloud_connection_id = null, updated_at = now()
  where cloud_connection_id = p_connection_id and user_id = v_user_id;
  if v_secret_id is not null then delete from vault.secrets where id = v_secret_id; end if;
  delete from public.user_cloud_connections
  where id = p_connection_id and user_id = v_user_id;
  return true;
end;
$$;
revoke all on function public.delete_user_supabase_connection(uuid) from public, anon;
grant execute on function public.delete_user_supabase_connection(uuid) to authenticated;
