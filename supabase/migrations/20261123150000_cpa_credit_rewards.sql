create table if not exists public.cpa_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  provider text not null default 'custom' check (char_length(provider) between 2 and 80),
  category text not null default 'general' check (char_length(category) between 2 and 80),
  destination_url text not null check (destination_url ~* '^https://'),
  reward_credits integer not null default 1 check (reward_credits > 0),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cpa_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid references public.cpa_offers(id) on delete set null,
  provider text not null default 'manual',
  provider_event_id text,
  tracking_id text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reward_credits integer not null check (reward_credits > 0),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id),
  unique(tracking_id)
);

create table if not exists public.ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  source text not null check (source in ('cpa_reward','admin_adjustment','ai_usage','welcome_bonus','refund')),
  reference_id uuid,
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists cpa_offers_active_sort_idx on public.cpa_offers(is_active, sort_order);
create index if not exists cpa_conversions_user_created_idx on public.cpa_conversions(user_id, created_at desc);
create index if not exists cpa_conversions_status_created_idx on public.cpa_conversions(status, created_at desc);
create index if not exists ai_credit_transactions_user_created_idx on public.ai_credit_transactions(user_id, created_at desc);

alter table public.cpa_offers enable row level security;
alter table public.cpa_conversions enable row level security;
alter table public.ai_credit_transactions enable row level security;

drop policy if exists "Anyone can view active CPA offers" on public.cpa_offers;
create policy "Anyone can view active CPA offers" on public.cpa_offers for select to anon, authenticated using (is_active = true);
drop policy if exists "Admins manage CPA offers" on public.cpa_offers;
create policy "Admins manage CPA offers" on public.cpa_offers for all to authenticated using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')) with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Users view own CPA conversions" on public.cpa_conversions;
create policy "Users view own CPA conversions" on public.cpa_conversions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Admins view CPA conversions" on public.cpa_conversions;
create policy "Admins view CPA conversions" on public.cpa_conversions for select to authenticated using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Users view own AI credit history" on public.ai_credit_transactions;
create policy "Users view own AI credit history" on public.ai_credit_transactions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Admins view AI credit history" on public.ai_credit_transactions;
create policy "Admins view AI credit history" on public.ai_credit_transactions for select to authenticated using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create or replace function public.admin_review_cpa_conversion(p_conversion_id uuid, p_approve boolean, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_user uuid;
  v_reward integer;
  v_balance integer;
begin
  if v_admin is null or not exists (
    select 1 from public.user_roles r where r.user_id = v_admin and r.role = 'admin'
  ) then
    raise exception 'Only administrators can review CPA conversions.';
  end if;

  update public.cpa_conversions
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = left(coalesce(p_note, ''), 1000),
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = p_conversion_id and status = 'pending'
   returning user_id, reward_credits into v_user, v_reward;

  if v_user is null then
    raise exception 'This conversion was already reviewed or does not exist.';
  end if;

  if not p_approve then
    select ai_credits into v_balance from public.profiles where id = v_user;
    return coalesce(v_balance, 0);
  end if;

  update public.profiles set ai_credits = ai_credits + v_reward
   where id = v_user returning ai_credits into v_balance;
  if v_balance is null then raise exception 'The member profile could not be found.'; end if;

  insert into public.ai_credit_transactions(user_id, amount, balance_after, source, reference_id, description)
  values (v_user, v_reward, v_balance, 'cpa_reward', p_conversion_id, 'Verified CPA offer completion');
  return v_balance;
end;
$$;

revoke all on function public.admin_review_cpa_conversion(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_cpa_conversion(uuid, boolean, text) to authenticated;

grant select on public.cpa_offers to anon, authenticated;
grant select on public.cpa_conversions, public.ai_credit_transactions to authenticated;
grant insert, update, delete on public.cpa_offers to authenticated;

notify pgrst, 'reload schema';