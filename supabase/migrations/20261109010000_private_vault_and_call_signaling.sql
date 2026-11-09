-- Authenticated WebRTC call signaling and audio voice-note storage.
-- The Personal Vault schema and bucket are managed by the existing
-- personal_vault_private_storage migration; do not create a second Vault.

drop policy if exists "Conversation members receive call signals" on realtime.messages;
create policy "Conversation members receive call signals"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() ~ '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and private.is_direct_conversation_member(
      case
        when split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then split_part(realtime.topic(), ':', 2)::uuid
        else null
      end
    )
  );

drop policy if exists "Conversation members send call signals" on realtime.messages;
create policy "Conversation members send call signals"
  on realtime.messages for insert to authenticated
  with check (
    payload ->> 'sender_id' = (select auth.uid())::text
    and realtime.topic() ~ '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and private.is_direct_conversation_member(
      case
        when split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then split_part(realtime.topic(), ':', 2)::uuid
        else null
      end
    )
  );

-- Extend the existing direct-message MIME allowlist without replacing it.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type)
  from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array[
    'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4',
    'audio/mpeg', 'audio/ogg', 'audio/wav'
  ]) as mime_type
)
where id = 'direct-messages';
