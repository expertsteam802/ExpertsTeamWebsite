alter table public.cpa_offers
  add column if not exists tracking_parameter text not null default 'subid'
  check (tracking_parameter ~ '^[A-Za-z][A-Za-z0-9_]{1,39}$');

drop function if exists public.start_cpa_offer(uuid);
create function public.start_cpa_offer(p_offer_id uuid)
returns table (tracking_id text, destination_url text, tracking_parameter text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_offer public.cpa_offers%rowtype;
  v_tracking text;
begin
  if v_user is null then raise exception 'Sign in to earn AI credits.'; end if;

  select * into v_offer from public.cpa_offers
   where id = p_offer_id and is_active = true;
  if not found then raise exception 'This offer is no longer available.'; end if;

  v_tracking := replace(gen_random_uuid()::text, '-', '');
  insert into public.cpa_conversions(user_id, offer_id, provider, tracking_id, reward_credits, status)
  values (v_user, v_offer.id, v_offer.provider, v_tracking, v_offer.reward_credits, 'pending')
  on conflict (user_id, offer_id) where status = 'pending' do nothing
  returning cpa_conversions.tracking_id into v_tracking;

  if v_tracking is null then
    select c.tracking_id into v_tracking
      from public.cpa_conversions c
     where c.user_id = v_user and c.offer_id = v_offer.id and c.status = 'pending'
     order by c.created_at desc limit 1;
  end if;

  return query select v_tracking, v_offer.destination_url, v_offer.tracking_parameter;
end;
$$;

revoke all on function public.start_cpa_offer(uuid) from public, anon;
grant execute on function public.start_cpa_offer(uuid) to authenticated;
notify pgrst, 'reload schema';