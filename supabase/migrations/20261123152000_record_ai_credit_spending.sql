create or replace function public.consume_ai_credit()
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

  update public.profiles
     set ai_credits = ai_credits - 1
   where id = v_user and ai_credits > 0
   returning ai_credits into v_remaining;

  if v_remaining is null then
    raise exception 'You have no AI credits remaining. Earn more credits from partner offers.';
  end if;

  insert into public.ai_credit_transactions(user_id, amount, balance_after, source, description)
  values (v_user, -1, v_remaining, 'ai_usage', 'AI request');

  return v_remaining;
end;
$$;

revoke all on function public.consume_ai_credit() from public, anon;
grant execute on function public.consume_ai_credit() to authenticated;
notify pgrst, 'reload schema';