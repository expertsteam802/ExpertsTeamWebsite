-- Authenticated WebRTC call signaling.
-- The Personal Vault schema and both storage buckets already exist; this
-- migration adds only private call-channel authorization policies.

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

