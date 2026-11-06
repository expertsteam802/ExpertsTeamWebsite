create table if not exists public.direct_conversation_hidden (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.direct_conversation_hidden enable row level security;

drop policy if exists "Users read their hidden conversations" on public.direct_conversation_hidden;
create policy "Users read their hidden conversations"
  on public.direct_conversation_hidden
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users hide their own conversations" on public.direct_conversation_hidden;
create policy "Users hide their own conversations"
  on public.direct_conversation_hidden
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_direct_conversation_member(conversation_id)
  );

drop policy if exists "Users restore their own conversations" on public.direct_conversation_hidden;
create policy "Users restore their own conversations"
  on public.direct_conversation_hidden
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.direct_conversation_hidden to authenticated;
