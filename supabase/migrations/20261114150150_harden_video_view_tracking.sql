create table if not exists public.video_view_events (
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_key text not null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (video_id, viewer_key, viewed_on)
);
create index if not exists video_view_events_viewed_on_idx
  on public.video_view_events(viewed_on);

alter table public.video_view_events enable row level security;
revoke all on public.video_view_events from public, anon, authenticated;
grant insert (video_id) on public.video_view_events to anon, authenticated;

create policy video_view_events_insert_public
  on public.video_view_events for insert to anon, authenticated
  with check (true);

create or replace function public.prepare_video_view_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_headers jsonb;
  v_client_ip text;
begin
  if new.video_id is null or not exists (
    select 1 from public.videos where id = new.video_id
  ) then
    return null;
  end if;

  if auth.uid() is not null then
    new.viewer_key := 'user:' || auth.uid()::text;
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
      return null;
    end if;
    new.viewer_key := 'ip:' || md5(btrim(v_client_ip) || ':' || current_date::text);
  end if;

  new.viewed_on := current_date;
  return new;
end;
$function$;

create or replace function public.increment_video_view_count()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.videos
  set views = coalesce(views, 0) + 1
  where id = new.video_id;
  return new;
end;
$function$;

drop trigger if exists prepare_video_view_event_before_insert on public.video_view_events;
create trigger prepare_video_view_event_before_insert
  before insert on public.video_view_events
  for each row execute function public.prepare_video_view_event();

drop trigger if exists increment_video_view_count_after_insert on public.video_view_events;
create trigger increment_video_view_count_after_insert
  after insert on public.video_view_events
  for each row execute function public.increment_video_view_count();

revoke all on function public.prepare_video_view_event() from public, anon, authenticated;
revoke all on function public.increment_video_view_count() from public, anon, authenticated;

create or replace function public.record_video_view(p_video_id uuid)
returns void
language sql
security invoker
set search_path to 'public'
as $function$
  insert into public.video_view_events(video_id)
  values (p_video_id)
  on conflict (video_id, viewer_key, viewed_on) do nothing;
$function$;

revoke all on function public.record_video_view(uuid) from public, anon, authenticated;
grant execute on function public.record_video_view(uuid) to anon, authenticated;

drop table if exists private.video_view_events;
