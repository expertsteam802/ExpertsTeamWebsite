-- MyLead Offerwall Rewards integration.
-- Applies after the existing CPA credit ledger migrations.
create table if not exists public.mylead_postback_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique check (char_length(transaction_id) between 1 and 200),
  player_id uuid not null references auth.users(id) on delete cascade,
  program_id text,
  program_name text,
  destination_program_id text,
  destination_program_name text,
  status text not null check (status in ('pending','pre_approved','approved','rejected')),
  virtual_amount integer not null default 0 check (virtual_amount >= 0),
  payout numeric(14,4),
  payout_decimal numeric(14,4),
  currency text,
  country_code text,
  lead_ip inet,
  goal_id text,
  goal_name text,
  raw_received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  cpa_conversion_id uuid references public.cpa_conversions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mylead_postback_events_player_created_idx
  on public.mylead_postback_events(player_id, created_at desc);
create index if not exists mylead_postback_events_status_idx
  on public.mylead_postback_events(status, created_at desc);

alter table public.mylead_postback_events enable row level security;
grant select on public.mylead_postback_events to authenticated;
revoke all on public.mylead_postback_events from anon, authenticated;
grant select on public.mylead_postback_events to authenticated;
create policy "Users and admins view MyLead events"
  on public.mylead_postback_events for select to authenticated
  using (
    player_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );

create or replace function public.process_mylead_offerwall_postback(
  p_transaction_id text,
  p_player_id uuid,
  p_status text,
  p_virtual_amount integer,
  p_program_id text default null,
  p_program_name text default null,
  p_destination_program_id text default null,
  p_destination_program_name text default null,
  p_payout numeric default null,
  p_payout_decimal numeric default null,
  p_currency text default null,
  p_country_code text default null,
  p_lead_ip inet default null,
  p_goal_id text default null,
  p_goal_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(p_status));
  v_event public.mylead_postback_events%rowtype;
  v_previous_status text;
  v_conversion_id uuid;
  v_balance integer;
  v_awarded integer := 0;
  v_debit integer := 0;
  v_tracking_id text;
begin
  if p_transaction_id is null or length(btrim(p_transaction_id)) = 0 or length(p_transaction_id) > 200 then
    raise exception 'Invalid MyLead transaction ID.';
  end if;
  if p_player_id is null then raise exception 'Missing MyLead player ID.'; end if;
  if v_status not in ('pending','pre_approved','approved','rejected') then
    raise exception 'Unsupported MyLead conversion status.';
  end if;
  if coalesce(p_virtual_amount, 0) < 0 or p_virtual_amount > 100000000 then
    raise exception 'Invalid MyLead virtual amount.';
  end if;
  if v_status = 'approved' and coalesce(p_virtual_amount, 0) < 1 then
    raise exception 'Approved MyLead conversion has no valid virtual amount.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_player_id) then
    raise exception 'MyLead player does not match an ExpertsTeam account.';
  end if;

  insert into public.mylead_postback_events (
    transaction_id, player_id, program_id, program_name,
    destination_program_id, destination_program_name, status,
    virtual_amount, payout, payout_decimal, currency, country_code,
    lead_ip, goal_id, goal_name, processed_at
  ) values (
    btrim(p_transaction_id), p_player_id, p_program_id, p_program_name,
    p_destination_program_id, p_destination_program_name, 'pending',
    coalesce(p_virtual_amount, 0), p_payout, p_payout_decimal,
    p_currency, p_country_code, p_lead_ip, p_goal_id, p_goal_name, now()
  )
  on conflict (transaction_id) do nothing;

  select * into v_event
    from public.mylead_postback_events
   where transaction_id = btrim(p_transaction_id)
   for update;

  if v_event.player_id <> p_player_id then
    raise exception 'MyLead transaction ID is already associated with another player.';
  end if;
  v_previous_status := v_event.status;

  -- Keep the latest state and metadata for this unique transaction.
  update public.mylead_postback_events
     set status = v_status,
         virtual_amount = coalesce(p_virtual_amount, 0),
         program_id = coalesce(p_program_id, program_id),
         program_name = coalesce(p_program_name, program_name),
         destination_program_id = coalesce(p_destination_program_id, destination_program_id),
         destination_program_name = coalesce(p_destination_program_name, destination_program_name),
         payout = coalesce(p_payout, payout),
         payout_decimal = coalesce(p_payout_decimal, payout_decimal),
         currency = coalesce(p_currency, currency),
         country_code = coalesce(p_country_code, country_code),
         lead_ip = coalesce(p_lead_ip, lead_ip),
         goal_id = coalesce(p_goal_id, goal_id),
         goal_name = coalesce(p_goal_name, goal_name),
         processed_at = now(),
         updated_at = now()
   where transaction_id = btrim(p_transaction_id);

  v_tracking_id := 'mylead_' || md5(btrim(p_transaction_id));

  insert into public.cpa_conversions (
    user_id, provider, provider_event_id, tracking_id, status, reward_credits, admin_note, reviewed_at
  ) values (
    p_player_id, 'MyLead Offerwall', btrim(p_transaction_id), v_tracking_id,
    case when v_status = 'pre_approved' then 'pending' else v_status end,
    greatest(coalesce(p_virtual_amount, 0), 1),
    'MyLead Offerwall transaction', now()
  )
  on conflict (provider, provider_event_id) do update
    set status = excluded.status,
        reward_credits = excluded.reward_credits,
        admin_note = excluded.admin_note,
        reviewed_at = now()
  returning id into v_conversion_id;

  update public.mylead_postback_events
     set cpa_conversion_id = v_conversion_id
   where transaction_id = btrim(p_transaction_id);

  -- Lock the event row so concurrent/retried callbacks cannot award twice.
  select * into v_event
    from public.mylead_postback_events
   where transaction_id = btrim(p_transaction_id)
   for update;

  if v_status = 'approved' and v_previous_status <> 'approved' then
    -- The previous status is already updated above; the ledger's unique reference
    -- is the final idempotency guard. A transaction can only be awarded once.
    if not exists (
      select 1 from public.ai_credit_transactions t
       where t.source = 'cpa_reward' and t.reference_id = v_conversion_id and t.amount > 0
    ) then
      update public.profiles
         set ai_credits = ai_credits + p_virtual_amount
       where id = p_player_id
       returning ai_credits into v_balance;
      if v_balance is null then raise exception 'ExpertsTeam profile not found.'; end if;
      insert into public.ai_credit_transactions (
        user_id, amount, balance_after, source, reference_id, description
      ) values (
        p_player_id, p_virtual_amount, v_balance, 'cpa_reward', v_conversion_id,
        'MyLead Offerwall approved conversion: ' || left(btrim(p_transaction_id), 80)
      );
      v_awarded := p_virtual_amount;
    end if;
  elsif v_status = 'rejected' then
    -- If MyLead rejects a previously credited transaction, claw back only the
    -- remaining balance. We never allow a negative balance; the shortfall remains
    -- visible in the event/conversion audit for administrator review.
    if exists (
      select 1 from public.ai_credit_transactions t
       where t.source = 'cpa_reward' and t.reference_id = v_conversion_id and t.amount > 0
    ) and not exists (
      select 1 from public.ai_credit_transactions t
       where t.source = 'refund' and t.reference_id = v_conversion_id
    ) then
      select ai_credits into v_balance from public.profiles where id = p_player_id for update;
      v_debit := least(coalesce(v_balance, 0), greatest(coalesce(p_virtual_amount, 0), 1));
      if v_debit > 0 then
        update public.profiles set ai_credits = ai_credits - v_debit
         where id = p_player_id returning ai_credits into v_balance;
        insert into public.ai_credit_transactions (
          user_id, amount, balance_after, source, reference_id, description
        ) values (
          p_player_id, -v_debit, v_balance, 'refund', v_conversion_id,
          'MyLead rejected conversion reversal: ' || left(btrim(p_transaction_id), 80)
        );
      end if;
    end if;
  end if;

  select ai_credits into v_balance from public.profiles where id = p_player_id;
  return jsonb_build_object(
    'status', v_status,
    'transaction_id', btrim(p_transaction_id),
    'credits_awarded', v_awarded,
    'credits_reversed', v_debit,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.process_mylead_offerwall_postback(text, uuid, text, integer, text, text, text, text, numeric, numeric, text, text, inet, text, text)
  from public, anon, authenticated;
grant execute on function public.process_mylead_offerwall_postback(text, uuid, text, integer, text, text, text, text, numeric, numeric, text, text, inet, text, text)
  to service_role;

notify pgrst, 'reload schema';
