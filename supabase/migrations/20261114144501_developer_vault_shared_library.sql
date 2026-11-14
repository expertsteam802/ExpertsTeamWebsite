create table if not exists public.developer_vault_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  group_name text not null check (char_length(group_name) between 1 and 180),
  group_kind text not null check (group_kind in ('file', 'project')),
  uploader_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 500),
  relative_path text not null check (char_length(relative_path) between 1 and 1000),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists developer_vault_items_group_created_idx
  on public.developer_vault_items (group_id, created_at desc);
create index if not exists developer_vault_items_created_idx
  on public.developer_vault_items (created_at desc);

alter table public.developer_vault_items enable row level security;
revoke all on public.developer_vault_items from anon, public;
grant select, insert, delete on public.developer_vault_items to authenticated;

create policy developer_vault_select_team
  on public.developer_vault_items for select to authenticated
  using (
    public.has_role((select auth.uid()), 'developer'::public.app_role)
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  );
create policy developer_vault_insert_team
  on public.developer_vault_items for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and (
      public.has_role((select auth.uid()), 'developer'::public.app_role)
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
    )
  );
create policy developer_vault_delete_owner_or_admin
  on public.developer_vault_items for delete to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or (
      uploader_id = (select auth.uid())
      and public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('developer-vault', 'developer-vault', false, 104857600, null)
on conflict (id) do update
set public = false, file_size_limit = 104857600, allowed_mime_types = null;

create policy developer_vault_storage_select_team
  on storage.objects for select to authenticated
  using (
    bucket_id = 'developer-vault'
    and (
      public.has_role((select auth.uid()), 'developer'::public.app_role)
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
    )
  );
create policy developer_vault_storage_insert_team
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'developer-vault'
    and (storage.foldername(name))[1] = (select (auth.uid())::text)
    and (
      public.has_role((select auth.uid()), 'developer'::public.app_role)
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
    )
  );
create policy developer_vault_storage_delete_owner_or_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'developer-vault'
    and (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      or (
        (storage.foldername(name))[1] = (select (auth.uid())::text)
        and public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
    )
  );
