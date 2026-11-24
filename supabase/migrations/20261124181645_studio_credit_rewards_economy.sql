-- ExpertsTeam Agent Studio credit rewards economy.
-- Applied to Supabase project btphazswhmkkuuyulqpt as migration
-- 20261124181645_studio_credit_rewards_economy.

create table if not exists public.credit_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8,16}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.credit_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  reward_credits integer not null default 15 check (reward_credits > 0),
  check (referrer_id <> referred_user_id)
);
create index if not exists credit_referrals_referrer_idx on public.credit_referrals(referrer_id, created_at desc);
create index if not exists credit_referrals_pending_idx on public.credit_referrals(referred_user_id, created_at) where rewarded_at is null;
create table if not exists public.credit_daily_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_claim_date date,
  updated_at timestamptz not null default now()
);
create table if not exists public.creator_tips (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount between 1 and 1000),
  message text not null default '' check (char_length(message) <= 240),
  created_at timestamptz not null default now(),
  check (sender_id <> creator_id)
);
create index if not exists creator_tips_creator_created_idx on public.creator_tips(creator_id, created_at desc);
create index if not exists creator_tips_sender_created_idx on public.creator_tips(sender_id, created_at desc);

alter table public.credit_referral_codes enable row level security;
alter table public.credit_referrals enable row level security;
alter table public.credit_daily_streaks enable row level security;
alter table public.creator_tips enable row level security;
drop policy if exists "Users view own referral records" on public.credit_referrals;
create policy "Users view own referral records" on public.credit_referrals for select to authenticated
using (referrer_id = (select auth.uid()) or referred_user_id = (select auth.uid()));
drop policy if exists "Users view own streak" on public.credit_daily_streaks;
create policy "Users view own streak" on public.credit_daily_streaks for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "Users view own tips" on public.creator_tips;
create policy "Users view own tips" on public.creator_tips for select to authenticated
using (sender_id = (select auth.uid()) or creator_id = (select auth.uid()));
grant select on public.credit_referrals, public.credit_daily_streaks, public.creator_tips to authenticated;
revoke all on public.credit_referral_codes from anon, authenticated;
revoke insert, update, delete on public.credit_referrals, public.credit_daily_streaks, public.creator_tips from anon, authenticated;

alter table public.ai_credit_transactions drop constraint if exists ai_credit_transactions_source_check;
alter table public.ai_credit_transactions add constraint ai_credit_transactions_source_check
check (source in ('cpa_reward','admin_adjustment','ai_usage','welcome_bonus','refund','daily_streak','referral_bonus','creator_tip','credit_topup'));

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

create or replace function public.claim_daily_credit_streak()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_streak public.credit_daily_streaks%rowtype;
  v_today date := (now() at time zone 'UTC')::date;
  v_reward integer;
  v_balance integer;
begin
  if v_user is null then raise exception 'Sign in to claim your daily reward.'; end if;
  insert into public.credit_daily_streaks(user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_streak from public.credit_daily_streaks where user_id = v_user for update;
  if v_streak.last_claim_date = v_today then
    return jsonb_build_object('claimed', false, 'streak', v_streak.current_streak, 'reward', 0,
      'balance', (select ai_credits from public.profiles where id = v_user));
  end if;
  if v_streak.last_claim_date = v_today - 1 then
    v_streak.current_streak := v_streak.current_streak + 1;
  else
    v_streak.current_streak := 1;
  end if;
  v_reward := case when v_streak.current_streak >= 7 then 6 else 5 end;
  update public.credit_daily_streaks set current_streak = v_streak.current_streak,
    longest_streak = greatest(longest_streak, v_streak.current_streak), last_claim_date = v_today, updated_at = now()
    where user_id = v_user;
  update public.profiles set ai_credits = ai_credits + v_reward where id = v_user returning ai_credits into v_balance;
  if v_balance is null then raise exception 'Your member profile could not be found.'; end if;
  insert into public.ai_credit_transactions(user_id, amount, balance_after, source, description)
  values (v_user, v_reward, v_balance, 'daily_streak',
    case when v_streak.current_streak >= 7 then 'Daily check-in · 5 credits + 20% streak bonus' else 'Daily check-in reward' end);
  return jsonb_build_object('claimed', true, 'streak', v_streak.current_streak, 'reward', v_reward,
    'bonus', v_reward - 5, 'balance', v_balance);
end;
$$;

create or replace function public.claim_eligible_referral_bonus()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_referral public.credit_referrals%rowtype;
  v_created_at timestamptz;
  v_last_sign_in timestamptz;
  v_balance integer;
  v_count integer := 0;
begin
  if v_user is null then raise exception 'Sign in to check referral rewards.'; end if;
  select created_at, last_sign_in_at into v_created_at, v_last_sign_in from auth.users where id = v_user;
  if v_created_at is null or v_last_sign_in is null or v_created_at > now() - interval '7 days'
     or v_last_sign_in < v_created_at + interval '7 days' then
    return jsonb_build_object('awarded', 0);
  end if;
  for v_referral in select * from public.credit_referrals
    where referred_user_id = v_user and rewarded_at is null for update
  loop
    update public.credit_referrals set rewarded_at = now() where id = v_referral.id and rewarded_at is null;
    if found then
      update public.profiles set ai_credits = ai_credits + v_referral.reward_credits
        where id = v_referral.referrer_id returning ai_credits into v_balance;
      if v_balance is not null then
        insert into public.ai_credit_transactions(user_id, amount, balance_after, source, reference_id, description)
        values (v_referral.referrer_id, v_referral.reward_credits, v_balance, 'referral_bonus',
          v_referral.id, 'Referral reward · invited member active for 7 days');
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('awarded', v_count);
end;
$$;

create or replace function public.tip_creator_by_username(p_username text, p_amount integer, p_message text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sender uuid := auth.uid();
  v_creator uuid;
  v_sender_balance integer;
  v_creator_balance integer;
  v_tip_id uuid := gen_random_uuid();
  v_amount integer := p_amount;
begin
  if v_sender is null then raise exception 'Sign in to send a creator tip.'; end if;
  if v_amount is null or v_amount < 1 or v_amount > 1000 then raise exception 'Tip amount must be between 1 and 1,000 credits.'; end if;
  if char_length(coalesce(p_message, '')) > 240 then raise exception 'Tip message must be 240 characters or fewer.'; end if;
  select p.id into v_creator from public.profiles p join public.user_roles r on r.user_id = p.id
    where lower(p.username) = lower(btrim(p_username)) and r.role = 'creator'::public.app_role limit 1;
  if v_creator is null then raise exception 'That username is not an eligible ExpertsTeam creator.'; end if;
  if v_creator = v_sender then raise exception 'You cannot tip your own account.'; end if;
  update public.profiles set ai_credits = ai_credits - v_amount where id = v_sender and ai_credits >= v_amount returning ai_credits into v_sender_balance;
  if v_sender_balance is null then raise exception 'Not enough credits for this tip.'; end if;
  update public.profiles set ai_credits = ai_credits + v_amount where id = v_creator returning ai_credits into v_creator_balance;
  if v_creator_balance is null then raise exception 'Creator profile is unavailable.'; end if;
  insert into public.creator_tips(id, sender_id, creator_id, amount, message)
    values (v_tip_id, v_sender, v_creator, v_amount, left(coalesce(p_message, ''), 240));
  insert into public.ai_credit_transactions(user_id, amount, balance_after, source, reference_id, description)
  values
    (v_sender, -v_amount, v_sender_balance, 'creator_tip', v_tip_id, 'Creator tip sent to ' || lower(btrim(p_username))),
    (v_creator, v_amount, v_creator_balance, 'creator_tip', v_tip_id, 'Creator tip received');
  return jsonb_build_object('tip_id', v_tip_id, 'sender_balance', v_sender_balance, 'creator_balance', v_creator_balance);
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base_username text;
  final_username text;
  suffix integer := 0;
  assigned_role public.app_role;
  v_referrer uuid;
  v_referral_code text;
  v_welcome_balance integer;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user'),
    '[^a-z0-9_]', '', 'g'));
  if base_username = '' then base_username := 'user'; end if;
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1; final_username := base_username || suffix::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, final_username,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', final_username),
    new.raw_user_meta_data->>'avatar_url');
  assigned_role := case when lower(coalesce(new.email, '')) = 'expertsteam2011@gmail.com'
    then 'admin'::public.app_role else 'member'::public.app_role end;
  insert into public.user_roles (user_id, role) values (new.id, assigned_role) on conflict (user_id, role) do nothing;
  update public.profiles set ai_credits = ai_credits + 10 where id = new.id returning ai_credits into v_welcome_balance;
  insert into public.ai_credit_transactions(user_id, amount, balance_after, source, description)
  values (new.id, 10, v_welcome_balance, 'welcome_bonus', 'Welcome to ExpertsTeam · starter credits');
  v_referral_code := upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  if v_referral_code <> '' then
    select user_id into v_referrer from public.credit_referral_codes where code = v_referral_code;
    if v_referrer is not null and v_referrer <> new.id then
      insert into public.credit_referrals(referrer_id, referred_user_id, referral_code)
      values (v_referrer, new.id, v_referral_code) on conflict (referred_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.get_my_credit_referral_code() from public, anon;
revoke all on function public.claim_daily_credit_streak() from public, anon;
revoke all on function public.claim_eligible_referral_bonus() from public, anon;
revoke all on function public.tip_creator_by_username(text, integer, text) from public, anon;
grant execute on function public.get_my_credit_referral_code() to authenticated;
grant execute on function public.claim_daily_credit_streak() to authenticated;
grant execute on function public.claim_eligible_referral_bonus() to authenticated;
grant execute on function public.tip_creator_by_username(text, integer, text) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
notify pgrst, 'reload schema';
