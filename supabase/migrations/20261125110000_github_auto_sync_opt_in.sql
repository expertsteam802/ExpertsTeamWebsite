-- GitHub synchronization must be explicitly enabled by the project owner.
-- Existing links are paused to prevent an automatic push from overwriting remote work.
alter table public.project_repos
  alter column auto_sync_enabled set default false;

update public.project_repos
set auto_sync_enabled = false
where auto_sync_enabled = true;
