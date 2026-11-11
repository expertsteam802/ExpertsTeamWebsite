-- Publicly serve only published app metadata.
-- Anonymous visitors never receive source files, messages or private workspace fields.
drop policy if exists "Published apps require sign in" on public.agent_projects;
drop policy if exists "Published apps are publicly viewable" on public.agent_projects;
create policy "Published apps are publicly viewable"
  on public.agent_projects
  for select
  to anon, authenticated
  using (published = true);

grant select (id, name, slug, published, deployment_url, thumbnail_url, updated_at)
  on public.agent_projects to anon;
