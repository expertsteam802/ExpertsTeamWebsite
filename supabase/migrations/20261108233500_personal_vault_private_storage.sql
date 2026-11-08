-- A private, per-member file vault. Files are stored in a non-public bucket;
-- both metadata rows and Storage objects are restricted to their owning user.

create table if not exists public.personal_vault_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

alter table public.personal_vault_files enable row level security;
revoke all on public.personal_vault_files from anon, public;
grant select, insert, update, delete on public.personal_vault_files to authenticated;

create policy "personal_vault_files_select_own"
on public.personal_vault_files for select to authenticated
using ((select auth.uid()) = user_id);

create policy "personal_vault_files_insert_own"
on public.personal_vault_files for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "personal_vault_files_update_own"
on public.personal_vault_files for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "personal_vault_files_delete_own"
on public.personal_vault_files for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists personal_vault_files_user_created_idx
on public.personal_vault_files (user_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-vault', 'personal-vault', false, 104857600, null)
on conflict (id) do update set public = false, file_size_limit = 104857600;

create policy "personal_vault_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'personal-vault'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "personal_vault_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'personal-vault'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "personal_vault_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'personal-vault'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'personal-vault'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "personal_vault_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'personal-vault'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
