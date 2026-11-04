-- Tighten Data API grants and keep auth checks cached in row policies.
REVOKE ALL ON TABLE
  public.direct_conversations,
  public.direct_conversation_members,
  public.direct_messages
FROM anon, PUBLIC;

GRANT SELECT, INSERT ON public.direct_conversations TO authenticated;
GRANT SELECT, INSERT ON public.direct_conversation_members TO authenticated;
GRANT UPDATE (last_read_at) ON public.direct_conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.direct_messages TO authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.is_direct_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_add_direct_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.bump_direct_conversation_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_direct_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_add_direct_conversation_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members read direct conversations" ON public.direct_conversations;
CREATE POLICY "Members read direct conversations"
  ON public.direct_conversations FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR private.is_direct_conversation_member(id)
  );

DROP POLICY IF EXISTS "Members create direct conversations" ON public.direct_conversations;
CREATE POLICY "Members create direct conversations"
  ON public.direct_conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Members see conversation participants" ON public.direct_conversation_members;
CREATE POLICY "Members see conversation participants"
  ON public.direct_conversation_members FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.is_direct_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "Conversation creators add participants" ON public.direct_conversation_members;
CREATE POLICY "Conversation creators add participants"
  ON public.direct_conversation_members FOR INSERT TO authenticated
  WITH CHECK (private.can_add_direct_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Members update own read state" ON public.direct_conversation_members;
CREATE POLICY "Members update own read state"
  ON public.direct_conversation_members FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.is_direct_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "Members read direct messages" ON public.direct_messages;
CREATE POLICY "Members read direct messages"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (private.is_direct_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Members send their own direct messages" ON public.direct_messages;
CREATE POLICY "Members send their own direct messages"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.is_direct_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "Authors delete their direct messages" ON public.direct_messages;
CREATE POLICY "Authors delete their direct messages"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS direct_conversations_created_by_idx
  ON public.direct_conversations (created_by);
CREATE INDEX IF NOT EXISTS direct_messages_sender_idx
  ON public.direct_messages (sender_id);
