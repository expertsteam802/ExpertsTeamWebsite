-- Persistent per-project GitHub repository links and sync metadata.
create table if not exists public.project_repos (
  project_id uuid primary key references public.agent_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  repo_owner text not null check (length(repo_owner) between 1 and 100),
  repo_name text not null check (length(repo_name) between 1 and 100),
  default_branch text not null default 'main' check (length(default_branch) between 1 and 255),
  active_branch text not null default 'main' check (length(active_branch) between 1 and 255),
  last_synced_sha text,
  auto_sync_enabled boolean not null default true,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_repos_owner_name_safe check (repo_owner ~ '^[A-Za-z0-9_.-]+$' and repo_name ~ '^[A-Za-z0-9_.-]+$')
);
create index if not exists project_repos_user_idx on public.project_repos(user_id, updated_at desc);
alter table public.project_repos enable row level security;
drop policy if exists "Users can read their project GitHub links" on public.project_repos;
create policy "Users can read their project GitHub links" on public.project_repos
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their project GitHub links" on public.project_repos;
create policy "Users can create their project GitHub links" on public.project_repos
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can update their project GitHub links" on public.project_repos;
create policy "Users can update their project GitHub links" on public.project_repos
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.agent_projects p where p.id = project_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "Users can delete their project GitHub links" on public.project_repos;
create policy "Users can delete their project GitHub links" on public.project_repos
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.project_repos to authenticated;
