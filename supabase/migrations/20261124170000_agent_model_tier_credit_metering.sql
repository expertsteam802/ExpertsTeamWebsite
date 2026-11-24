create or replace function public.consume_ai_credits(p_amount integer, p_description text default 'Agent request')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_remaining integer;
begin
  if v_user is null then
    raise exception 'Sign in to use ExpertAI.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 3 then
    raise exception 'Invalid AI credit amount.';
  end if;

  update public.profiles
     set ai_credits = ai_credits - p_amount
   where id = v_user
     and ai_credits >= p_amount
   returning ai_credits into v_remaining;

  if v_remaining is null then
    raise exception 'Not enough AI credits for this model. Choose Fast or earn more credits.';
  end if;

  insert into public.ai_credit_transactions(user_id, amount, balance_after, source, description)
  values (v_user, -p_amount, v_remaining, 'ai_usage', left(coalesce(p_description, 'Agent request'), 500));

  return v_remaining;
end;
$$;

revoke all on function public.consume_ai_credits(integer, text) from public;
revoke all on function public.consume_ai_credits(integer, text) from anon;
grant execute on function public.consume_ai_credits(integer, text) to authenticated;
