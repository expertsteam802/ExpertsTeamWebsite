-- Instagram-style 24-hour community stories.
CREATE TABLE IF NOT EXISTS public.community_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT community_stories_caption_length CHECK (length(caption) <= 500),
  CONSTRAINT community_stories_expiry_window CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '25 hours'
  )
);

CREATE INDEX IF NOT EXISTS community_stories_active_idx
  ON public.community_stories (expires_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS community_stories_author_idx
  ON public.community_stories (user_id, created_at DESC);

ALTER TABLE public.community_stories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_stories FROM anon, PUBLIC;
GRANT SELECT ON public.community_stories TO anon, authenticated;
GRANT INSERT, DELETE ON public.community_stories TO authenticated;

DROP POLICY IF EXISTS "Anyone can view active community stories" ON public.community_stories;
CREATE POLICY "Anyone can view active community stories"
  ON public.community_stories FOR SELECT TO anon, authenticated
  USING (expires_at > (SELECT now()));

DROP POLICY IF EXISTS "Members create their own community stories" ON public.community_stories;
CREATE POLICY "Members create their own community stories"
  ON public.community_stories FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND expires_at > (SELECT now())
    AND expires_at <= (SELECT now()) + interval '25 hours'
  );

DROP POLICY IF EXISTS "Authors and admins delete community stories" ON public.community_stories;
CREATE POLICY "Authors and admins delete community stories"
  ON public.community_stories FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'community_stories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_stories;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
