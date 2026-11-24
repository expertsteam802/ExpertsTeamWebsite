create table if not exists public.user_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_credits integer not null default 0 check (ai_credits >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_credit_balances enable row level security;
revoke all on public.user_credit_balances from anon, authenticated;
grant select on public.user_credit_balances to authenticated;

drop policy if exists "Users can read own credit balance" on public.user_credit_balances;
create policy "Users can read own credit balance"
  on public.user_credit_balances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.sync_user_credit_balance_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_credit_balances (user_id, ai_credits, updated_at)
  values (new.id, greatest(coalesce(new.ai_credits, 0), 0), now())
  on conflict (user_id) do update
    set ai_credits = excluded.ai_credits,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.sync_user_credit_balance_from_profile() from public, anon, authenticated;

drop trigger if exists sync_user_credit_balance_from_profile on public.profiles;
create trigger sync_user_credit_balance_from_profile
  after insert or update of ai_credits on public.profiles
  for each row
  execute function public.sync_user_credit_balance_from_profile();

insert into public.user_credit_balances (user_id, ai_credits, updated_at)
select id, greatest(coalesce(ai_credits, 0), 0), now()
from public.profiles
on conflict (user_id) do update
  set ai_credits = excluded.ai_credits,
      updated_at = now();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_credit_balances'
  ) then
    alter publication supabase_realtime add table public.user_credit_balances;
  end if;
end
$$;

notify pgrst, 'reload schema';
