create index if not exists cpa_conversions_offer_id_idx on public.cpa_conversions(offer_id);
create index if not exists cpa_conversions_reviewed_by_idx on public.cpa_conversions(reviewed_by);

drop policy if exists "Admins manage CPA offers" on public.cpa_offers;
drop policy if exists "Anyone can view active CPA offers" on public.cpa_offers;
create policy "View active CPA offers or all as admin"
on public.cpa_offers for select to anon, authenticated
using (
  is_active = true
  or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
);
create policy "Admins insert CPA offers"
on public.cpa_offers for insert to authenticated
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy "Admins update CPA offers"
on public.cpa_offers for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy "Admins delete CPA offers"
on public.cpa_offers for delete to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Admins view CPA conversions" on public.cpa_conversions;
drop policy if exists "Users view own CPA conversions" on public.cpa_conversions;
create policy "Users and admins view CPA conversions"
on public.cpa_conversions for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
);

drop policy if exists "Admins view AI credit history" on public.ai_credit_transactions;
drop policy if exists "Users view own AI credit history" on public.ai_credit_transactions;
create policy "Users and admins view AI credit history"
on public.ai_credit_transactions for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
);

notify pgrst, 'reload schema';