-- Monitor the published application URL (not only the underlying storage object).
revoke insert,update,delete on public.agent_project_deployments from anon,authenticated;

create or replace function public.dispatch_agent_project_uptime_checks()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row record; v_request_id bigint; v_count integer := 0;
begin
  for v_row in
    select d.id as deployment_id,d.project_id,d.user_id,d.public_url
    from public.agent_project_deployments d
    join public.agent_project_uptime_settings s on s.project_id=d.project_id and s.enabled=true
    where d.environment='production' and d.is_current=true and d.status='success'
      and d.public_url ~ '^https://(expertsteam[.]giize[.]com|[a-z0-9-]+[.]expertsteam[.]giize[.]com)/'
  loop
    v_request_id := net.http_get(url:=v_row.public_url,headers:='{"User-Agent":"ExpertsTeam-Uptime/1.0"}'::jsonb,timeout_milliseconds:=8000);
    if v_request_id is not null then
      insert into public.agent_project_uptime_checks(project_id,user_id,deployment_id,request_id,url)
      values(v_row.project_id,v_row.user_id,v_row.deployment_id,v_request_id,v_row.public_url);
      v_count := v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.dispatch_agent_project_uptime_checks() from public,anon,authenticated;
notify pgrst,'reload schema';
