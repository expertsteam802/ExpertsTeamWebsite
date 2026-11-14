create table if not exists private.video_view_events (
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_key text not null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (video_id, viewer_key, viewed_on)
);
create index if not exists video_view_events_viewed_on_idx
  on private.video_view_events(viewed_on);

revoke all on private.video_view_events from public, anon, authenticated;

create or replace function public.record_video_view(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_viewer_key text;
  v_headers jsonb;
  v_client_ip text;
begin
  if p_video_id is null then
    return;
  end if;

  perform 1 from public.videos where id = p_video_id;
  if not found then
    return;
  end if;

  if auth.uid() is not null then
    v_viewer_key := 'user:' || auth.uid()::text;
  else
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    v_client_ip := split_part(
      coalesce(
        v_headers->>'cf-connecting-ip',
        v_headers->>'x-real-ip',
        v_headers->>'x-forwarded-for',
        ''
      ),
      ',',
      1
    );
    if v_client_ip is null or btrim(v_client_ip) = '' then
      return;
    end if;
    v_viewer_key := 'ip:' || md5(btrim(v_client_ip) || ':' || current_date::text);
  end if;

  insert into private.video_view_events(video_id, viewer_key, viewed_on)
  values (p_video_id, v_viewer_key, current_date)
  on conflict (video_id, viewer_key, viewed_on) do nothing;

  if found then
    update public.videos
    set views = coalesce(views, 0) + 1
    where id = p_video_id;
  end if;
end;
$function$;

revoke all on function public.record_video_view(uuid) from public;
grant execute on function public.record_video_view(uuid) to anon, authenticated;
