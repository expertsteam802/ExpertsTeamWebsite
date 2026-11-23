-- Project-scoped encrypted environment variables and external service credentials.
-- Values are encrypted by the application before they reach this table.
create table if not exists public.agent_project_env_vars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9_]{0,127}$'),
  encrypted_value text not null,
  nonce text not null,
  auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, key)
);
create index if not exists agent_project_env_vars_project_idx
  on public.agent_project_env_vars(project_id, user_id);
alter table public.agent_project_env_vars enable row level security;
revoke all on public.agent_project_env_vars from anon, authenticated;
grant select, insert, update, delete on public.agent_project_env_vars to authenticated;
create policy "Project owners manage their environment variable ciphertext"
  on public.agent_project_env_vars for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
  ));
grant all on public.agent_project_env_vars to service_role;
comment on table public.agent_project_env_vars is
  'Project-scoped environment variables. Values are AES-256-GCM ciphertext; plaintext must never be stored.';
