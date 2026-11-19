create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('post','comment','story','video','file')),
  content_id text not null,
  reason text not null check (reason in ('copyright','piracy','adult','hate_or_harassment','violence','illegal_activity','malware_or_scam','misleading','other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (reporter_id, content_type, content_id)
);
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
grant select, insert, update on public.content_reports to authenticated;
drop policy if exists "Members submit content reports" on public.content_reports;
create policy "Members submit content reports" on public.content_reports for insert to authenticated
with check (reporter_id = (select auth.uid()));
drop policy if exists "Members view own content reports" on public.content_reports;
create policy "Members view own content reports" on public.content_reports for select to authenticated
using (reporter_id = (select auth.uid()));
drop policy if exists "Admins review content reports" on public.content_reports;
create policy "Admins review content reports" on public.content_reports for select to authenticated
using (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Admins update content reports" on public.content_reports;
create policy "Admins update content reports" on public.content_reports for update to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));
create index if not exists content_reports_status_created_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_content_idx on public.content_reports (content_type, content_id);
notify pgrst, 'reload schema';