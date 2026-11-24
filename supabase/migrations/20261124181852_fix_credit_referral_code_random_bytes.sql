-- Correct the referral-code generator for the empty search_path used by the RPC.
create or replace function public.get_my_credit_referral_code()
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_code text;
begin
  if v_user is null then raise exception 'Sign in to get your referral link.'; end if;
  select code into v_code from public.credit_referral_codes where user_id = v_user;
  if v_code is null then
    v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10));
    insert into public.credit_referral_codes(user_id, code) values (v_user, v_code)
    on conflict (user_id) do update set user_id = excluded.user_id returning code into v_code;
  end if;
  return v_code;
end;
$$;
revoke all on function public.get_my_credit_referral_code() from public, anon;
grant execute on function public.get_my_credit_referral_code() to authenticated;
