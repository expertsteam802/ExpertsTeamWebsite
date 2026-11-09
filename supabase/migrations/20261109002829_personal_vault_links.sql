-- Personal Vault supports private external links as well as uploaded files.
alter table public.personal_vault_files
  alter column storage_path drop not null;

alter table public.personal_vault_files
  add column if not exists file_url text;

alter table public.personal_vault_files
  add column if not exists entry_type text not null default 'file';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.personal_vault_files'::regclass
      and conname = 'personal_vault_files_entry_type_check'
  ) then
    alter table public.personal_vault_files
      add constraint personal_vault_files_entry_type_check
      check (entry_type in ('file', 'link'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.personal_vault_files'::regclass
      and conname = 'personal_vault_files_link_url_check'
  ) then
    alter table public.personal_vault_files
      add constraint personal_vault_files_link_url_check
      check (
        (entry_type = 'file' and file_url is null and storage_path is not null)
        or
        (entry_type = 'link' and file_url is not null and storage_path is null)
      );
  end if;
end
$$;
