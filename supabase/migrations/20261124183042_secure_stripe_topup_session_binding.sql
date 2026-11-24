-- Bind a verified Stripe completion to the exact Checkout Session stored on the order.
create or replace function public.complete_stripe_credit_topup(p_order_id uuid,p_event_id text,p_checkout_session_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := current_setting('request.jwt.claim.role',true);
  v_order public.credit_topup_orders%rowtype;
  v_balance integer;
begin
  if coalesce(v_role,'') <> 'service_role' then raise exception 'Stripe top-ups require service-role authentication.'; end if;
  if p_event_id is null or p_event_id='' or p_checkout_session_id is null or p_checkout_session_id='' then raise exception 'Missing Stripe event or session identifier.'; end if;
  select * into v_order from public.credit_topup_orders where id=p_order_id for update;
  if v_order.id is null or v_order.provider <> 'stripe' then raise exception 'Stripe top-up order not found.'; end if;
  if v_order.status='paid' then return jsonb_build_object('ok',true,'duplicate',true); end if;
  if v_order.status <> 'pending' then raise exception 'Stripe top-up order is no longer pending.'; end if;
  if v_order.stripe_checkout_session_id is null or v_order.stripe_checkout_session_id <> p_checkout_session_id then raise exception 'Stripe checkout session does not match this top-up order.'; end if;
  update public.profiles set ai_credits=ai_credits+v_order.credits_requested where id=v_order.user_id returning ai_credits into v_balance;
  if v_balance is null then raise exception 'Member profile is unavailable.'; end if;
  insert into public.ai_credit_transactions(user_id,amount,balance_after,source,reference_id,description)
  values(v_order.user_id,v_order.credits_requested,v_balance,'credit_topup',v_order.id,'Stripe credit top-up');
  update public.credit_topup_orders set status='paid',stripe_event_id=p_event_id,paid_at=now(),updated_at=now() where id=p_order_id;
  return jsonb_build_object('ok',true,'duplicate',false,'credits',v_order.credits_requested,'balance',v_balance);
end;
$$;
revoke all on function public.complete_stripe_credit_topup(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_stripe_credit_topup(uuid,text,text) to service_role;
