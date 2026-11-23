alter table public.agent_project_checkpoints
  add column if not exists is_bookmarked boolean not null default false;

drop policy if exists "Owners update own checkpoint bookmarks" on public.agent_project_checkpoints;
create policy "Owners update own checkpoint bookmarks"
on public.agent_project_checkpoints for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.agent_projects p where p.id = agent_project_checkpoints.project_id and p.user_id = (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.agent_projects p where p.id = agent_project_checkpoints.project_id and p.user_id = (select auth.uid()))
);

grant update on public.agent_project_checkpoints to authenticated;
notify pgrst, 'reload schema';