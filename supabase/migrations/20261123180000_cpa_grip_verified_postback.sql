create or replace function public.process_cpa_grip_conversion(
  p_tracking_id text,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversion public.cpa_conversions%rowtype;
  v_event_id text;
  v_balance integer;
begin
  if p_tracking_id is null or length(btrim(p_tracking_id)) < 8 or length(p_tracking_id) > 128 then
    raise exception 'Invalid CPA Grip tracking identifier.';
  end if;

  v_event_id := coalesce(nullif(left(btrim(p_provider_event_id), 200), ''), p_tracking_id);

  select * into v_conversion
    from public.cpa_conversions c
   where c.tracking_id = p_tracking_id
     and regexp_replace(lower(c.provider), '[^a-z0-9]', '', 'g') = 'cpagrip'
   for update;

  if not found then
    raise exception 'No matching pending CPA Grip conversion was found.';
  end if;

  if v_conversion.status = 'approved' then
    return jsonb_build_object('status', 'already_approved', 'tracking_id', p_tracking_id, 'credits_awarded', 0);
  end if;
  if v_conversion.status <> 'pending' then
    return jsonb_build_object('status', v_conversion.status, 'tracking_id', p_tracking_id, 'credits_awarded', 0);
  end if;

  if exists (
    select 1 from public.cpa_conversions c
     where c.provider_event_id = v_event_id
       and regexp_replace(lower(c.provider), '[^a-z0-9]', '', 'g') = 'cpagrip'
       and c.id <> v_conversion.id
  ) then
    raise exception 'This CPA Grip event identifier has already been processed.';
  end if;

  update public.cpa_conversions
     set status = 'approved',
         provider_event_id = v_event_id,
         admin_note = 'Verified by CPA Grip server postback.',
         reviewed_at = now(),
         reviewed_by = null
   where id = v_conversion.id;

  update public.profiles
     set ai_credits = ai_credits + v_conversion.reward_credits
   where id = v_conversion.user_id
   returning ai_credits into v_balance;

  if v_balance is null then
    raise exception 'The member profile could not be found.';
  end if;

  insert into public.ai_credit_transactions(
    user_id, amount, balance_after, source, reference_id, description
  ) values (
    v_conversion.user_id, v_conversion.reward_credits, v_balance,
    'cpa_reward', v_conversion.id, 'CPA Grip verified offer completion'
  );

  return jsonb_build_object(
    'status', 'approved',
    'tracking_id', p_tracking_id,
    'credits_awarded', v_conversion.reward_credits,
    'balance_after', v_balance
  );
end;
$$;

revoke all on function public.process_cpa_grip_conversion(text, text) from public, anon, authenticated;
grant execute on function public.process_cpa_grip_conversion(text, text) to service_role;
notify pgrst, 'reload schema';
