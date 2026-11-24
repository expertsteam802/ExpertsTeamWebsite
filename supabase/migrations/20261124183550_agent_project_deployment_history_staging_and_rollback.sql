-- Immutable deployment releases, staging-password metadata and rollback RPCs.
create table if not exists public.agent_project_deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  environment text not null check (environment in ('production','staging')),
  release_id text not null,
  deployment_url text not null,
  public_url text not null,
  status text not null default 'success' check (status in ('success','failed','rolled_back')),
  file_count integer not null default 0 check (file_count >= 0),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(project_id,environment,release_id)
);
create index if not exists agent_project_deployments_history_idx on public.agent_project_deployments(project_id,environment,created_at desc);
create unique index if not exists agent_project_deployments_current_idx on public.agent_project_deployments(project_id,environment) where is_current=true;
create table if not exists public.agent_project_staging_access (
  project_id uuid primary key references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.agent_project_deployments enable row level security;
alter table public.agent_project_staging_access enable row level security;
drop policy if exists "Owners view deployment history" on public.agent_project_deployments;
create policy "Owners view deployment history" on public.agent_project_deployments for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Owners create deployment history" on public.agent_project_deployments;
create policy "Owners create deployment history" on public.agent_project_deployments for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.agent_projects p where p.id=project_id and p.user_id=(select auth.uid())));
drop policy if exists "Owners update deployment history" on public.agent_project_deployments;
create policy "Owners update deployment history" on public.agent_project_deployments for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists "Owners view staging access" on public.agent_project_staging_access;
create policy "Owners view staging access" on public.agent_project_staging_access for select to authenticated using (user_id=(select auth.uid()));
grant select,insert,update on public.agent_project_deployments to authenticated;
grant select on public.agent_project_staging_access to authenticated;
revoke insert,update,delete on public.agent_project_staging_access from anon,authenticated;

create or replace function public.record_agent_project_deployment(
  p_project_id uuid,p_slug text,p_environment text,p_release_id text,p_deployment_url text,p_public_url text,p_file_count integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Sign in to publish this project.'; end if;
  if p_environment not in ('production','staging') then raise exception 'Invalid deployment environment.'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then raise exception 'Invalid deployment slug.'; end if;
  if p_release_id is null or p_release_id='' or p_deployment_url !~ '^https://' or p_public_url !~ '^https://' then raise exception 'Invalid deployment release metadata.'; end if;
  if p_file_count is null or p_file_count<1 or p_file_count>50000 then raise exception 'Invalid published file count.'; end if;
  if not exists(select 1 from public.agent_projects where id=p_project_id and user_id=v_user) then raise exception 'Project not found or access denied.'; end if;
  update public.agent_project_deployments set is_current=false where project_id=p_project_id and environment=p_environment and is_current=true;
  insert into public.agent_project_deployments(project_id,user_id,slug,environment,release_id,deployment_url,public_url,file_count,is_current,created_by)
  values(p_project_id,v_user,p_slug,p_environment,p_release_id,p_deployment_url,p_public_url,p_file_count,true,v_user) returning id into v_id;
  if p_environment='production' then
    update public.agent_projects set published=true,slug=p_slug,deployment_url=p_deployment_url,last_build_status='success',last_build_at=now(),updated_at=now()
     where id=p_project_id and user_id=v_user;
  else
    update public.agent_projects set last_build_status='success',last_build_at=now(),updated_at=now() where id=p_project_id and user_id=v_user;
  end if;
  return v_id;
end;
$$;

create or replace function public.rollback_agent_project_deployment(p_project_id uuid,p_deployment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_target public.agent_project_deployments%rowtype;
begin
  if v_user is null then raise exception 'Sign in to roll back a deployment.'; end if;
  if not exists(select 1 from public.agent_projects where id=p_project_id and user_id=v_user) then raise exception 'Project not found or access denied.'; end if;
  select * into v_target from public.agent_project_deployments where id=p_deployment_id and project_id=p_project_id
    and user_id=v_user and environment='production' and status='success' for update;
  if v_target.id is null then raise exception 'The selected production release is unavailable.'; end if;
  update public.agent_project_deployments set is_current=false where project_id=p_project_id and environment='production' and is_current=true;
  update public.agent_project_deployments set is_current=true where id=p_deployment_id and project_id=p_project_id;
  update public.agent_projects set published=true,slug=v_target.slug,deployment_url=v_target.deployment_url,
    last_build_status='success',last_build_at=now(),updated_at=now() where id=p_project_id and user_id=v_user;
  return jsonb_build_object('deployment_id',v_target.id,'public_url',v_target.public_url,'release_id',v_target.release_id);
end;
$$;
revoke all on function public.record_agent_project_deployment(uuid,text,text,text,text,text,integer) from public,anon;
grant execute on function public.record_agent_project_deployment(uuid,text,text,text,text,text,integer) to authenticated;
revoke all on function public.rollback_agent_project_deployment(uuid,uuid) from public,anon;
grant execute on function public.rollback_agent_project_deployment(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
