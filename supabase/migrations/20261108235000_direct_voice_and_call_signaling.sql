-- Allow private voice-note attachments and add RLS-protected WebRTC signaling.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif',
  'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'
]
where id = 'direct-messages';

create table if not exists public.direct_call_signals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup','reject')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint direct_call_signals_not_self check (from_user_id <> to_user_id),
  constraint direct_call_signals_payload_size check (pg_column_size(payload) <= 65536)
);

alter table public.direct_call_signals enable row level security;
revoke all on public.direct_call_signals from anon, public;
grant select, insert, delete on public.direct_call_signals to authenticated;

create policy "direct_call_signals_read_participants"
on public.direct_call_signals for select to authenticated
using (
  (select auth.uid()) in (from_user_id, to_user_id)
  and exists (
    select 1 from public.direct_conversation_members m
    where m.conversation_id = direct_call_signals.conversation_id
      and m.user_id = (select auth.uid())
  )
);

create policy "direct_call_signals_insert_sender"
on public.direct_call_signals for insert to authenticated
with check (
  from_user_id = (select auth.uid())
  and exists (
    select 1 from public.direct_conversation_members sender
    where sender.conversation_id = direct_call_signals.conversation_id
      and sender.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.direct_conversation_members recipient
    where recipient.conversation_id = direct_call_signals.conversation_id
      and recipient.user_id = direct_call_signals.to_user_id
  )
);

create policy "direct_call_signals_delete_participants"
on public.direct_call_signals for delete to authenticated
using (
  (select auth.uid()) in (from_user_id, to_user_id)
  and exists (
    select 1 from public.direct_conversation_members m
    where m.conversation_id = direct_call_signals.conversation_id
      and m.user_id = (select auth.uid())
  )
);

create index if not exists direct_call_signals_recipient_created_idx
on public.direct_call_signals (to_user_id, created_at desc);

create index if not exists direct_call_signals_conversation_created_idx
on public.direct_call_signals (conversation_id, created_at desc);
