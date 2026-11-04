-- Keep one-to-one chat media private to conversation members.
ALTER TABLE public.direct_messages
  RENAME COLUMN media_url TO media_path;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'direct-messages',
  'direct-messages',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Conversation members can view private message media" ON storage.objects;
CREATE POLICY "Conversation members can view private message media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'direct-messages'
    AND private.is_direct_conversation_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Conversation members upload their own message media" ON storage.objects;
CREATE POLICY "Conversation members upload their own message media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'direct-messages'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    AND private.is_direct_conversation_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Users delete their own private message media" ON storage.objects;
CREATE POLICY "Users delete their own private message media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'direct-messages'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    AND private.is_direct_conversation_member(((storage.foldername(name))[1])::uuid)
  );
