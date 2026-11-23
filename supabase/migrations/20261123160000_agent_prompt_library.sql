create table if not exists public.agent_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 100),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 20000),
  category text not null default 'custom' check (char_length(category) between 2 and 40),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_prompt_templates_user_updated_idx
  on public.agent_prompt_templates(user_id, updated_at desc);

alter table public.agent_prompt_templates enable row level security;

drop policy if exists "Users manage their own prompt templates" on public.agent_prompt_templates;
create policy "Users manage their own prompt templates"
on public.agent_prompt_templates for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.agent_prompt_templates to authenticated;
notify pgrst, 'reload schema';