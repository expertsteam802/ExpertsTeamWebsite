-- Aggregate published-app traffic/errors and persist owner-visible deployment logs.
create table if not exists public.agent_project_analytics_daily (
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  day date not null,
  views bigint not null default 0 check (views >= 0),
  errors bigint not null default 0 check (errors >= 0),
  updated_at timestamptz not null default now(),
  primary key(project_id,day)
);
create table if not exists public.agent_project_build_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment in ('production','staging')),
  status text not null check (status in ('success','failed')),
  release_id text,
  message text not null default '' check (char_length(message) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists agent_project_build_logs_project_created_idx on public.agent_project_build_logs(project_id,created_at desc);
alter table public.agent_project_analytics_daily enable row level security;
alter table public.agent_project_build_logs enable row level security;
drop policy if exists "Owners view project analytics" on public.agent_project_analytics_daily;
create policy "Owners view project analytics" on public.agent_project_analytics_daily for select to authenticated
using (exists(select 1 from public.agent_projects p where p.id=project_id and p.user_id=(select auth.uid())));
drop policy if exists "Owners view project build logs" on public.agent_project_build_logs;
create policy "Owners view project build logs" on public.agent_project_build_logs for select to authenticated
using (user_id=(select auth.uid()));
drop policy if exists "Owners append project build logs" on public.agent_project_build_logs;
create policy "Owners append project build logs" on public.agent_project_build_logs for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.agent_projects p where p.id=project_id and p.user_id=(select auth.uid())));
grant select on public.agent_project_analytics_daily,public.agent_project_build_logs to authenticated;
grant insert on public.agent_project_build_logs to authenticated;
revoke insert,update,delete on public.agent_project_analytics_daily from anon,authenticated;

create or replace function public.record_public_project_event(p_slug text,p_event_type text,p_route_path text default '/')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then return jsonb_build_object('recorded',false); end if;
  if p_event_type not in ('view','error') then raise exception 'Unsupported analytics event.'; end if;
  select id into v_project_id from public.agent_projects where slug=p_slug and published=true limit 1;
  if v_project_id is null then return jsonb_build_object('recorded',false); end if;
  if p_event_type='view' then
    insert into public.agent_project_analytics_daily(project_id,day,views)
    values(v_project_id,(now() at time zone 'UTC')::date,1)
    on conflict(project_id,day) do update set views=public.agent_project_analytics_daily.views+1,updated_at=now();
  else
    insert into public.agent_project_analytics_daily(project_id,day,errors)
    values(v_project_id,(now() at time zone 'UTC')::date,1)
    on conflict(project_id,day) do update set errors=public.agent_project_analytics_daily.errors+1,updated_at=now();
  end if;
  return jsonb_build_object('recorded',true);
end;
$$;
revoke all on function public.record_public_project_event(text,text,text) from public;
grant execute on function public.record_public_project_event(text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
