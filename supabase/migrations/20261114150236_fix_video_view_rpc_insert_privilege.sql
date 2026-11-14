create or replace function public.record_video_view(p_video_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if p_video_id is null then
    return;
  end if;

  insert into public.video_view_events(video_id)
  values (p_video_id);
exception
  when unique_violation then
    return;
end;
$function$;

revoke all on function public.record_video_view(uuid) from public, anon, authenticated;
grant execute on function public.record_video_view(uuid) to anon, authenticated;
