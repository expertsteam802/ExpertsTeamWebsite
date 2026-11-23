create or replace function public.start_cpa_offer(p_offer_id uuid)
returns table (tracking_id text, destination_url text)
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
  values (v_user, v_offer.id, v_offer.provider, v_tracking, v_offer.reward_credits, 'pending');

  return query select v_tracking, v_offer.destination_url;
end;
$$;

revoke all on function public.start_cpa_offer(uuid) from public, anon;
grant execute on function public.start_cpa_offer(uuid) to authenticated;
notify pgrst, 'reload schema';