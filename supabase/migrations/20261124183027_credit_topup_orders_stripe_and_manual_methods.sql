-- Credit top-up order ledger for Mobile Money, Airtel Money, crypto and Stripe.
create table if not exists public.credit_topup_rates (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('momo','airtel','crypto','stripe')),
  currency text not null check (currency ~ '^[A-Z]{3,5}$'),
  credits_per_unit numeric(14,4) not null check (credits_per_unit > 0 and credits_per_unit <= 100000),
  min_amount numeric(14,2) not null default 1 check (min_amount > 0),
  max_amount numeric(14,2) not null default 100000 check (max_amount >= min_amount),
  payment_instructions text not null default '' check (char_length(payment_instructions) <= 2000),
  is_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(provider,currency)
);
create table if not exists public.credit_topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('momo','airtel','crypto','stripe')),
  currency text not null,
  amount numeric(14,2) not null check (amount > 0),
  credits_requested integer not null check (credits_requested > 0),
  credits_per_unit numeric(14,4) not null check (credits_per_unit > 0),
  payment_reference text,
  payment_note text not null default '' check (char_length(payment_note) <= 500),
  status text not null default 'pending' check (status in ('pending','paid','rejected','expired')),
  checkout_url text,
  stripe_checkout_session_id text unique,
  stripe_event_id text unique,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credit_topup_orders_user_created_idx on public.credit_topup_orders(user_id,created_at desc);
create index if not exists credit_topup_orders_status_created_idx on public.credit_topup_orders(status,created_at desc);
alter table public.credit_topup_rates enable row level security;
alter table public.credit_topup_orders enable row level security;
drop policy if exists "Members view enabled topup rates" on public.credit_topup_rates;
create policy "Members view enabled topup rates" on public.credit_topup_rates for select to authenticated
using (is_enabled or public.has_role((select auth.uid()),'admin'::public.app_role));
drop policy if exists "Admins manage topup rates" on public.credit_topup_rates;
create policy "Admins manage topup rates" on public.credit_topup_rates for all to authenticated
using (public.has_role((select auth.uid()),'admin'::public.app_role))
with check (public.has_role((select auth.uid()),'admin'::public.app_role));
drop policy if exists "Members view own topup orders" on public.credit_topup_orders;
create policy "Members view own topup orders" on public.credit_topup_orders for select to authenticated
using (user_id=(select auth.uid()) or public.has_role((select auth.uid()),'admin'::public.app_role));
grant select on public.credit_topup_rates to authenticated;
grant insert,update,delete on public.credit_topup_rates to authenticated;
grant select on public.credit_topup_orders to authenticated;
revoke insert,update,delete on public.credit_topup_orders from anon,authenticated;

create or replace function public.create_credit_topup_order(p_provider text,p_currency text,p_amount numeric,p_payment_reference text default null,p_payment_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_rate public.credit_topup_rates%rowtype;
  v_credits integer;
  v_order public.credit_topup_orders%rowtype;
begin
  if v_user is null then raise exception 'Sign in to top up your credit balance.'; end if;
  if p_provider not in ('momo','airtel','crypto','stripe') then raise exception 'Unsupported payment method.'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3,5}$' then raise exception 'Choose a valid payment currency.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter a valid top-up amount.'; end if;
  if p_provider='stripe' and p_currency <> 'USD' then raise exception 'Stripe top-ups are currently configured in USD.'; end if;
  if p_provider <> 'stripe' and char_length(btrim(coalesce(p_payment_reference,''))) < 4 then raise exception 'Enter the payment transaction reference before submitting.';
  end if;
  select * into v_rate from public.credit_topup_rates where provider=p_provider and currency=p_currency and is_enabled=true;
  if v_rate.id is null then raise exception 'This payment method and currency are not enabled yet.'; end if;
  if p_amount < v_rate.min_amount or p_amount > v_rate.max_amount then raise exception 'The amount is outside the configured top-up limits.'; end if;
  v_credits := floor(p_amount * v_rate.credits_per_unit)::integer;
  if v_credits < 1 or v_credits > 10000000 then raise exception 'The configured conversion produces an invalid credit amount.'; end if;
  insert into public.credit_topup_orders(user_id,provider,currency,amount,credits_requested,credits_per_unit,payment_reference,payment_note)
  values(v_user,p_provider,p_currency,p_amount,v_credits,v_rate.credits_per_unit,nullif(left(btrim(coalesce(p_payment_reference,'')),160),''),left(coalesce(p_payment_note,''),500))
  returning * into v_order;
  return jsonb_build_object('id',v_order.id,'provider',v_order.provider,'currency',v_order.currency,'amount',v_order.amount,
    'credits',v_order.credits_requested,'rate',v_order.credits_per_unit,'instructions',v_rate.payment_instructions,'status',v_order.status);
end;
$$;

create or replace function public.admin_review_credit_topup(p_order_id uuid,p_approve boolean,p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := auth.uid();
  v_order public.credit_topup_orders%rowtype;
  v_balance integer;
begin
  if v_admin is null or not public.has_role(v_admin,'admin'::public.app_role) then raise exception 'Only administrators can review credit top-ups.'; end if;
  select * into v_order from public.credit_topup_orders where id=p_order_id for update;
  if v_order.id is null or v_order.status <> 'pending' or v_order.provider='stripe' then raise exception 'This top-up is unavailable for manual review.'; end if;
  if p_approve then
    update public.profiles set ai_credits=ai_credits+v_order.credits_requested where id=v_order.user_id returning ai_credits into v_balance;
    if v_balance is null then raise exception 'Member profile is unavailable.'; end if;
    insert into public.ai_credit_transactions(user_id,amount,balance_after,source,reference_id,description)
    values(v_order.user_id,v_order.credits_requested,v_balance,'credit_topup',v_order.id,'Verified '||upper(v_order.provider)||' credit top-up');
    update public.credit_topup_orders set status='paid',reviewed_by=v_admin,reviewed_at=now(),paid_at=now(),
      payment_note=left(coalesce(p_note,payment_note),500),updated_at=now() where id=p_order_id;
  else
    update public.credit_topup_orders set status='rejected',reviewed_by=v_admin,reviewed_at=now(),
      payment_note=left(coalesce(p_note,payment_note),500),updated_at=now() where id=p_order_id;
    select ai_credits into v_balance from public.profiles where id=v_order.user_id;
  end if;
  return jsonb_build_object('status',case when p_approve then 'paid' else 'rejected' end,'balance',coalesce(v_balance,0));
end;
$$;

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

revoke all on function public.create_credit_topup_order(text,text,numeric,text,text) from public,anon;
grant execute on function public.create_credit_topup_order(text,text,numeric,text,text) to authenticated;
revoke all on function public.admin_review_credit_topup(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_credit_topup(uuid,boolean,text) to authenticated;
revoke all on function public.complete_stripe_credit_topup(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_stripe_credit_topup(uuid,text,text) to service_role;
notify pgrst,'reload schema';
