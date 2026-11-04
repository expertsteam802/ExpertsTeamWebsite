-- Private one-to-one ExpertsTeam messaging.
CREATE TABLE IF NOT EXISTS public.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_key text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.direct_conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CONSTRAINT direct_messages_content_check CHECK (length(btrim(body)) > 0 OR media_url IS NOT NULL),
  CONSTRAINT direct_messages_body_length CHECK (length(body) <= 5000)
);

CREATE INDEX IF NOT EXISTS direct_conversations_recent_idx
  ON public.direct_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS direct_members_user_idx
  ON public.direct_conversation_members (user_id, last_read_at);
CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx
  ON public.direct_messages (conversation_id, created_at DESC);

ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_direct_conversation_member(target_conversation uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.direct_conversation_members member
    WHERE member.conversation_id = target_conversation
      AND member.user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.is_direct_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_direct_conversation_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_add_direct_conversation_member(target_conversation uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.direct_conversations conversation
    WHERE conversation.id = target_conversation
      AND conversation.created_by = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.can_add_direct_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_add_direct_conversation_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members read direct conversations" ON public.direct_conversations;
CREATE POLICY "Members read direct conversations"
  ON public.direct_conversations FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR private.is_direct_conversation_member(id));

DROP POLICY IF EXISTS "Members create direct conversations" ON public.direct_conversations;
CREATE POLICY "Members create direct conversations"
  ON public.direct_conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Members see conversation participants" ON public.direct_conversation_members;
CREATE POLICY "Members see conversation participants"
  ON public.direct_conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_direct_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Conversation creators add participants" ON public.direct_conversation_members;
CREATE POLICY "Conversation creators add participants"
  ON public.direct_conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    private.can_add_direct_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "Members update own read state" ON public.direct_conversation_members;
CREATE POLICY "Members update own read state"
  ON public.direct_conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_direct_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Members read direct messages" ON public.direct_messages;
CREATE POLICY "Members read direct messages"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (public.is_direct_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Members send their own direct messages" ON public.direct_messages;
CREATE POLICY "Members send their own direct messages"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_direct_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "Authors delete their direct messages" ON public.direct_messages;
CREATE POLICY "Authors delete their direct messages"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION private.bump_direct_conversation_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
BEGIN
  UPDATE public.direct_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$;
REVOKE ALL ON FUNCTION private.bump_direct_conversation_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS direct_message_bump_activity ON public.direct_messages;
CREATE TRIGGER direct_message_bump_activity
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION private.bump_direct_conversation_activity();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
END $$;

GRANT SELECT, INSERT ON public.direct_conversations TO authenticated;
REVOKE UPDATE ON public.direct_conversation_members FROM authenticated;
GRANT SELECT, INSERT ON public.direct_conversation_members TO authenticated;
GRANT UPDATE (last_read_at) ON public.direct_conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.direct_messages TO authenticated;
NOTIFY pgrst, 'reload schema';
