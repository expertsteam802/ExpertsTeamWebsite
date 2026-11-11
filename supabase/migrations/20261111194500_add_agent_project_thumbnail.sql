-- Optional project thumbnail/logo for the workspace and public showcase.
alter table public.agent_projects
  add column if not exists thumbnail_url text;

comment on column public.agent_projects.thumbnail_url is
  'Optional public HTTPS thumbnail or logo displayed in the project workspace and showcase.';
