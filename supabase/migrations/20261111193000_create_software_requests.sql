-- Public intake for custom business and personal software requests.
create table if not exists public.software_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (char_length(btrim(email)) between 5 and 254),
  business_name text,
  project_type text not null check (char_length(btrim(project_type)) between 2 and 80),
  description text not null check (char_length(btrim(description)) between 30 and 5000),
  budget text,
  contact_method text,
  status text not null default 'pending' check (status in ('pending','reviewing','in_progress','delivered','declined')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.software_requests enable row level security;

drop policy if exists "Anyone can submit a software request" on public.software_requests;
create policy "Anyone can submit a software request"
  on public.software_requests for insert to anon, authenticated
  with check (true);

drop policy if exists "Admins can view software requests" on public.software_requests;
create policy "Admins can view software requests"
  on public.software_requests for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins can update software requests" on public.software_requests;
create policy "Admins can update software requests"
  on public.software_requests for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant insert on public.software_requests to anon, authenticated;
grant select, update on public.software_requests to authenticated;
