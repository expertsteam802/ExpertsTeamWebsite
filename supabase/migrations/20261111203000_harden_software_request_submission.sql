-- Prevent signed-in requesters from attributing a public request to another account.
drop policy if exists "Anyone can submit a software request" on public.software_requests;
create policy "Anyone can submit a software request"
  on public.software_requests
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
