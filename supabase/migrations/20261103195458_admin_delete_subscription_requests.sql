create policy "Admins delete subscription requests"
on public.subscription_requests
for delete
to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role));
