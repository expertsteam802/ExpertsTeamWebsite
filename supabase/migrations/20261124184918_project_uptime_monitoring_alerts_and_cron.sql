-- Five-minute production uptime checks with in-app down/recovery alerts.
create table if not exists public.agent_project_uptime_settings (
  project_id uuid primary key references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  failure_threshold integer not null default 3 check (failure_threshold between 1 and 10),
  recovery_threshold integer not null default 2 check (recovery_threshold between 1 and 10),
  consecutive_failures integer not null default 0,
  consecutive_successes integer not null default 0,
  last_state text not null default 'unknown' check (last_state in ('unknown','up','down')),
  last_checked_at timestamptz,
  last_alert_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.agent_project_uptime_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deployment_id uuid not null references public.agent_project_deployments(id) on delete cascade,
  request_id bigint not null unique,
  url text not null,
  status text not null default 'pending' check (status in ('pending','up','down')),
  status_code integer,
  timed_out boolean not null default false,
  error_message text,
  response_time_ms integer,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_project_uptime_checks_history_idx on public.agent_project_uptime_checks(project_id,created_at desc);
create table if not exists public.agent_project_uptime_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('down','recovered')),
  message text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists agent_project_uptime_alerts_history_idx on public.agent_project_uptime_alerts(project_id,created_at desc);
alter table public.agent_project_uptime_settings enable row level security;
alter table public.agent_project_uptime_checks enable row level security;
alter table public.agent_project_uptime_alerts enable row level security;
drop policy if exists "Owners view uptime settings" on public.agent_project_uptime_settings;
create policy "Owners view uptime settings" on public.agent_project_uptime_settings for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Owners view uptime checks" on public.agent_project_uptime_checks;
create policy "Owners view uptime checks" on public.agent_project_uptime_checks for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Owners view uptime alerts" on public.agent_project_uptime_alerts;
create policy "Owners view uptime alerts" on public.agent_project_uptime_alerts for select to authenticated using (user_id=(select auth.uid()));
grant select on public.agent_project_uptime_settings,public.agent_project_uptime_checks,public.agent_project_uptime_alerts to authenticated;
revoke insert,update,delete on public.agent_project_uptime_settings,public.agent_project_uptime_checks,public.agent_project_uptime_alerts from anon,authenticated;

create or replace function public.set_agent_project_uptime_settings(p_project_id uuid,p_enabled boolean,p_failure_threshold integer default 3,p_recovery_threshold integer default 2)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in to configure uptime monitoring.'; end if;
  if p_failure_threshold not between 1 and 10 or p_recovery_threshold not between 1 and 10 then raise exception 'Alert thresholds must be between 1 and 10 checks.'; end if;
  if not exists(select 1 from public.agent_projects where id=p_project_id and user_id=v_user and published=true) then raise exception 'Publish this project to production before enabling uptime monitoring.'; end if;
  insert into public.agent_project_uptime_settings(project_id,user_id,enabled,failure_threshold,recovery_threshold,updated_at)
  values(p_project_id,v_user,p_enabled,p_failure_threshold,p_recovery_threshold,now())
  on conflict(project_id) do update set enabled=excluded.enabled,failure_threshold=excluded.failure_threshold,recovery_threshold=excluded.recovery_threshold,updated_at=now();
  return jsonb_build_object('enabled',p_enabled,'failure_threshold',p_failure_threshold,'recovery_threshold',p_recovery_threshold);
end;
$$;

create or replace function public.acknowledge_agent_project_uptime_alert(p_alert_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sign in to acknowledge uptime alerts.'; end if;
  update public.agent_project_uptime_alerts set acknowledged_at=now() where id=p_alert_id and user_id=v_user and acknowledged_at is null;
  return found;
end;
$$;

create or replace function public.dispatch_agent_project_uptime_checks()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row record; v_request_id bigint; v_count integer := 0;
begin
  for v_row in
    select d.id as deployment_id,d.project_id,d.user_id,d.deployment_url
    from public.agent_project_deployments d
    join public.agent_project_uptime_settings s on s.project_id=d.project_id and s.enabled=true
    where d.environment='production' and d.is_current=true and d.status='success'
      and d.deployment_url ~ '^https://[a-z0-9-]+[.]supabase[.]co/storage/v1/object/public/published-apps/'
  loop
    v_request_id := net.http_get(url:=v_row.deployment_url,headers:='{"User-Agent":"ExpertsTeam-Uptime/1.0"}'::jsonb,timeout_milliseconds:=8000);
    if v_request_id is not null then
      insert into public.agent_project_uptime_checks(project_id,user_id,deployment_id,request_id,url)
      values(v_row.project_id,v_row.user_id,v_row.deployment_id,v_request_id,v_row.deployment_url);
      v_count := v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.process_agent_project_uptime_responses()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_row record; v_is_up boolean; v_failures integer; v_successes integer; v_state text;
  v_failure_threshold integer; v_recovery_threshold integer; v_processed integer := 0; v_latency integer;
begin
  for v_row in
    select c.id,c.project_id,c.user_id,c.request_id,c.created_at,r.status_code,r.timed_out,r.error_msg,r.created as response_created
    from public.agent_project_uptime_checks c join net._http_response r on r.id=c.request_id where c.status='pending'
  loop
    v_is_up := v_row.status_code between 200 and 399 and not coalesce(v_row.timed_out,false) and v_row.error_msg is null;
    v_latency := greatest(0,least(60000,round(extract(epoch from (v_row.response_created-v_row.created_at))*1000)::integer));
    update public.agent_project_uptime_checks set status=case when v_is_up then 'up' else 'down' end,
      status_code=v_row.status_code,timed_out=coalesce(v_row.timed_out,false),error_message=v_row.error_msg,
      response_time_ms=v_latency,checked_at=v_row.response_created where id=v_row.id;
    select consecutive_failures,consecutive_successes,last_state,failure_threshold,recovery_threshold
      into v_failures,v_successes,v_state,v_failure_threshold,v_recovery_threshold
      from public.agent_project_uptime_settings where project_id=v_row.project_id for update;
    if not found then continue; end if;
    if v_is_up then
      v_successes:=v_successes+1; v_failures:=0;
      if v_state='down' and v_successes>=v_recovery_threshold then
        insert into public.agent_project_uptime_alerts(project_id,user_id,event_type,message)
        values(v_row.project_id,v_row.user_id,'recovered','Production is responding normally again.');
        v_state:='up';
      elsif v_state='unknown' then v_state:='up';
      end if;
    else
      v_failures:=v_failures+1; v_successes:=0;
      if v_state<>'down' and v_failures>=v_failure_threshold then
        insert into public.agent_project_uptime_alerts(project_id,user_id,event_type,message)
        values(v_row.project_id,v_row.user_id,'down','Production failed '||v_failures||' consecutive uptime checks.');
        v_state:='down';
      end if;
    end if;
    update public.agent_project_uptime_settings set consecutive_failures=v_failures,consecutive_successes=v_successes,
      last_state=v_state,last_checked_at=v_row.response_created,
      last_alert_at=case when v_state<>coalesce(last_state,'unknown') then now() else last_alert_at end,updated_at=now()
      where project_id=v_row.project_id;
    v_processed:=v_processed+1;
  end loop;
  delete from public.agent_project_uptime_checks where created_at<now()-interval '30 days';
  return v_processed;
end;
$$;
revoke all on function public.set_agent_project_uptime_settings(uuid,boolean,integer,integer) from public,anon;
grant execute on function public.set_agent_project_uptime_settings(uuid,boolean,integer,integer) to authenticated;
revoke all on function public.acknowledge_agent_project_uptime_alert(uuid) from public,anon;
grant execute on function public.acknowledge_agent_project_uptime_alert(uuid) to authenticated;
revoke all on function public.dispatch_agent_project_uptime_checks() from public,anon,authenticated;
revoke all on function public.process_agent_project_uptime_responses() from public,anon,authenticated;
select cron.unschedule(jobid) from cron.job where jobname in ('experts-project-uptime-dispatch','experts-project-uptime-process');
select cron.schedule('experts-project-uptime-dispatch','*/5 * * * *','select public.dispatch_agent_project_uptime_checks();');
select cron.schedule('experts-project-uptime-process','* * * * *','select public.process_agent_project_uptime_responses();');
notify pgrst,'reload schema';
