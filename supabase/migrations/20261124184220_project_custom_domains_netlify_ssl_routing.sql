-- Verified custom domains for project-specific host routing through Netlify.
create table if not exists public.agent_project_domains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  domain text not null unique,
  verification_host text not null,
  verification_token text not null,
  dns_target text not null,
  status text not null default 'pending' check (status in ('pending','active','failed')),
  netlify_added boolean not null default false,
  ssl_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists agent_project_domains_project_idx on public.agent_project_domains(project_id,created_at desc);
create index if not exists agent_project_domains_active_domain_idx on public.agent_project_domains(domain) where status='active';
alter table public.agent_project_domains enable row level security;
drop policy if exists "Owners view custom domains" on public.agent_project_domains;
create policy "Owners view custom domains" on public.agent_project_domains for select to authenticated using (user_id=(select auth.uid()));
grant select on public.agent_project_domains to authenticated;
revoke insert,update,delete on public.agent_project_domains from anon,authenticated;

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
    update public.agent_project_domains set slug=p_slug,updated_at=now() where project_id=p_project_id;
  else
    update public.agent_projects set last_build_status='success',last_build_at=now(),updated_at=now() where id=p_project_id and user_id=v_user;
  end if;
  return v_id;
end;
$$;
revoke all on function public.record_agent_project_deployment(uuid,text,text,text,text,text,integer) from public,anon;
grant execute on function public.record_agent_project_deployment(uuid,text,text,text,text,text,integer) to authenticated;
notify pgrst,'reload schema';
