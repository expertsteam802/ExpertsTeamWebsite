-- Unified provider callbacks, idempotent credit ledger and reversal debt.
-- The final function body is included here so clean installations receive the
-- corrected row-count handling, Torox reversal association and strict role gate.

create table if not exists public.credit_debts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  updated_at timestamptz not null default now()
);
alter table public.credit_debts enable row level security;
drop policy if exists "Users view own credit debt" on public.credit_debts;
create policy "Users view own credit debt" on public.credit_debts for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.credit_debts to authenticated;
revoke insert, update, delete on public.credit_debts from anon, authenticated;

create table if not exists public.offerwall_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('torox','adgate','cpx','lootably')),
  event_id text not null check (char_length(event_id) between 1 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','approved','reversed')),
  reward_credits integer not null check (reward_credits > 0),
  credited_amount integer not null default 0 check (credited_amount >= 0),
  reversed_amount integer not null default 0 check (reversed_amount >= 0),
  revenue_usd numeric(14,4),
  offer_id text,
  offer_name text,
  country_code text,
  source_ip inet,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,event_id)
);
create index if not exists offerwall_provider_events_user_created_idx on public.offerwall_provider_events(user_id,created_at desc);
create index if not exists offerwall_provider_events_provider_status_idx on public.offerwall_provider_events(provider,status,created_at desc);
alter table public.offerwall_provider_events enable row level security;
drop policy if exists "Users view own offerwall events" on public.offerwall_provider_events;
create policy "Users view own offerwall events" on public.offerwall_provider_events for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.offerwall_provider_events to authenticated;
revoke insert, update, delete on public.offerwall_provider_events from anon, authenticated;

alter table public.ai_credit_transactions drop constraint if exists ai_credit_transactions_source_check;
alter table public.ai_credit_transactions add constraint ai_credit_transactions_source_check
check (source in ('cpa_reward','admin_adjustment','ai_usage','welcome_bonus','refund','daily_streak','referral_bonus','creator_tip','credit_topup','offerwall_reward','offerwall_reversal'));

create or replace function public.process_offerwall_provider_event(
  p_provider text,p_event_id text,p_user_id uuid,p_status text,p_reward_credits integer,
  p_revenue_usd numeric default null,p_offer_id text default null,p_offer_name text default null,
  p_country_code text default null,p_source_ip inet default null,p_raw_event jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := current_setting('request.jwt.claim.role', true);
  v_event public.offerwall_provider_events%rowtype;
  v_original public.offerwall_provider_events%rowtype;
  v_balance integer;
  v_debt integer := 0;
  v_debt_paid integer := 0;
  v_net_credit integer := 0;
  v_debit integer := 0;
  v_target integer := 0;
  v_new_debt integer := 0;
  v_rows integer := 0;
  v_inserted boolean := false;
begin
  if coalesce(v_role,'') <> 'service_role' then raise exception 'Offerwall callbacks require service-role authentication.'; end if;
  if p_provider not in ('torox','adgate','cpx','lootably') then raise exception 'Unsupported offerwall provider.'; end if;
  if p_event_id is null or char_length(btrim(p_event_id)) < 1 or char_length(p_event_id) > 200 then raise exception 'Invalid provider transaction ID.'; end if;
  if p_user_id is null or not exists (select 1 from auth.users where id=p_user_id) then raise exception 'Unknown ExpertsTeam member.'; end if;
  if p_status not in ('pending','approved','reversed') then raise exception 'Unsupported offerwall event status.'; end if;
  if p_reward_credits is null or p_reward_credits < 1 or p_reward_credits > 100000 then raise exception 'Invalid offerwall reward amount.'; end if;

  insert into public.offerwall_provider_events(provider,event_id,user_id,status,reward_credits,revenue_usd,offer_id,offer_name,country_code,source_ip,raw_event)
  values(p_provider,btrim(p_event_id),p_user_id,'pending',p_reward_credits,p_revenue_usd,left(p_offer_id,200),left(p_offer_name,300),
    upper(left(p_country_code,2)),p_source_ip,coalesce(p_raw_event,'{}'::jsonb))
  on conflict(provider,event_id) do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_rows > 0;
  select * into v_event from public.offerwall_provider_events where provider=p_provider and event_id=btrim(p_event_id) for update;
  if v_event.user_id <> p_user_id then raise exception 'Provider transaction is already mapped to a different member.'; end if;

  if p_status='pending' then
    if v_event.status='pending' then
      update public.offerwall_provider_events set revenue_usd=coalesce(p_revenue_usd,revenue_usd),
        offer_id=coalesce(left(p_offer_id,200),offer_id),offer_name=coalesce(left(p_offer_name,300),offer_name),
        raw_event=coalesce(p_raw_event,raw_event),updated_at=now() where id=v_event.id;
    end if;
    return jsonb_build_object('ok',true,'pending',true,'duplicate',not v_inserted);
  end if;

  if p_status='approved' then
    if v_event.status='approved' then return jsonb_build_object('ok',true,'duplicate',true,'credited',v_event.credited_amount); end if;
    select coalesce(amount,0) into v_debt from public.credit_debts where user_id=p_user_id for update;
    v_debt_paid := least(v_debt,p_reward_credits);
    v_net_credit := p_reward_credits-v_debt_paid;
    if v_debt_paid>0 then
      if v_debt_paid=v_debt then delete from public.credit_debts where user_id=p_user_id;
      else update public.credit_debts set amount=amount-v_debt_paid,updated_at=now() where user_id=p_user_id;
      end if;
    end if;
    if v_net_credit>0 then
      update public.profiles set ai_credits=ai_credits+v_net_credit where id=p_user_id returning ai_credits into v_balance;
      if v_balance is null then raise exception 'Member profile is unavailable.'; end if;
      insert into public.ai_credit_transactions(user_id,amount,balance_after,source,reference_id,description)
      values(p_user_id,v_net_credit,v_balance,'offerwall_reward',v_event.id,'Verified '||upper(p_provider)||' offerwall reward');
    end if;
    update public.offerwall_provider_events set status='approved',reward_credits=p_reward_credits,credited_amount=v_net_credit,
      reversed_amount=0,revenue_usd=coalesce(p_revenue_usd,revenue_usd),offer_id=coalesce(left(p_offer_id,200),offer_id),
      offer_name=coalesce(left(p_offer_name,300),offer_name),country_code=coalesce(upper(left(p_country_code,2)),country_code),
      source_ip=coalesce(p_source_ip,source_ip),raw_event=coalesce(p_raw_event,raw_event),updated_at=now() where id=v_event.id;
    return jsonb_build_object('ok',true,'duplicate',false,'credited',v_net_credit,'debt_paid',v_debt_paid);
  end if;

  if v_event.status='reversed' then return jsonb_build_object('ok',true,'duplicate',true,'reversed',v_event.reversed_amount); end if;
  if v_event.status='approved' then
    v_original := v_event;
    v_target := greatest(v_event.credited_amount-v_event.reversed_amount,0);
  elsif p_provider='torox' and p_offer_id is not null then
    select * into v_original from public.offerwall_provider_events
     where provider='torox' and user_id=p_user_id and offer_id=p_offer_id and status='approved'
       and credited_amount>reversed_amount order by created_at desc limit 1 for update;
    if v_original.id is not null then v_target := greatest(v_original.credited_amount-v_original.reversed_amount,0); end if;
  end if;

  if v_target>0 then
    v_debit := least(v_target,coalesce((select ai_credits from public.profiles where id=p_user_id),0));
    if v_debit>0 then
      update public.profiles set ai_credits=ai_credits-v_debit where id=p_user_id returning ai_credits into v_balance;
      insert into public.ai_credit_transactions(user_id,amount,balance_after,source,reference_id,description)
      values(p_user_id,-v_debit,v_balance,'offerwall_reversal',coalesce(v_original.id,v_event.id),upper(p_provider)||' offerwall chargeback');
    end if;
    v_new_debt := greatest(v_target-v_debit,0);
    if v_new_debt>0 then
      insert into public.credit_debts(user_id,amount) values(p_user_id,v_new_debt)
      on conflict(user_id) do update set amount=public.credit_debts.amount+excluded.amount,updated_at=now();
    end if;
    if v_original.id is not null and v_original.id<>v_event.id then
      update public.offerwall_provider_events set status='reversed',reversed_amount=credited_amount,updated_at=now() where id=v_original.id;
    end if;
  end if;
  update public.offerwall_provider_events set status='reversed',reversed_amount=v_debit,
    raw_event=coalesce(p_raw_event,raw_event),updated_at=now() where id=v_event.id;
  return jsonb_build_object('ok',true,'duplicate',false,'reversed',v_debit,'debt_added',v_new_debt);
end;
$$;
revoke all on function public.process_offerwall_provider_event(text,text,uuid,text,integer,numeric,text,text,text,inet,jsonb) from public,anon,authenticated;
grant execute on function public.process_offerwall_provider_event(text,text,uuid,text,integer,numeric,text,text,text,inet,jsonb) to service_role;

create or replace function public.consume_ai_credits(p_amount integer, p_description text default 'Agent request')
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_remaining integer;
begin
  if v_user is null then raise exception 'Sign in to use ExpertAI.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 3 then raise exception 'Invalid AI credit amount.'; end if;
  if exists (select 1 from public.credit_debts where user_id=v_user and amount>0) then
    raise exception 'A partner offer was reversed after its credits were used. Earn credits to clear this balance before using ExpertAI again.';
  end if;
  update public.profiles set ai_credits=ai_credits-p_amount where id=v_user and ai_credits>=p_amount returning ai_credits into v_remaining;
  if v_remaining is null then raise exception 'Not enough AI credits for this model. Choose Fast or earn more credits.'; end if;
  insert into public.ai_credit_transactions(user_id,amount,balance_after,source,description)
  values(v_user,-p_amount,v_remaining,'ai_usage',left(coalesce(p_description,'Agent request'),500));
  return v_remaining;
end;
$$;
revoke all on function public.consume_ai_credits(integer,text) from public,anon;
grant execute on function public.consume_ai_credits(integer,text) to authenticated;

create or replace function public.consume_ai_credit()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_remaining integer;
begin
  if v_user is null then raise exception 'Sign in to use ExpertAI.'; end if;
  if exists (select 1 from public.credit_debts where user_id=v_user and amount>0) then
    raise exception 'A partner offer was reversed after its credits were used. Earn credits to clear this balance before using ExpertAI again.';
  end if;
  update public.profiles set ai_credits=ai_credits-1 where id=v_user and ai_credits>0 returning ai_credits into v_remaining;
  if v_remaining is null then raise exception 'You have no AI credits remaining. Earn more credits from partner offers.'; end if;
  insert into public.ai_credit_transactions(user_id,amount,balance_after,source,description)
  values(v_user,-1,v_remaining,'ai_usage','AI request');
  return v_remaining;
end;
$$;
revoke all on function public.consume_ai_credit() from public,anon;
grant execute on function public.consume_ai_credit() to authenticated;
notify pgrst,'reload schema';
