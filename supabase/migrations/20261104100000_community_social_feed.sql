-- Community feed: photo posts, reactions and realtime updates.
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS media_url text;
CREATE TABLE IF NOT EXISTS public.community_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_likes_post_user_unique UNIQUE (post_id, user_id)
);
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.community_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.community_likes TO authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_likes' AND policyname='Community likes are public') THEN
    CREATE POLICY "Community likes are public" ON public.community_likes FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_likes' AND policyname='Members like posts once') THEN
    CREATE POLICY "Members like posts once" ON public.community_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_likes' AND policyname='Members remove own likes') THEN
    CREATE POLICY "Members remove own likes" ON public.community_likes FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='community_posts') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='community_likes') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.community_likes; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='community_comments') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments; END IF;
END $$;
CREATE INDEX IF NOT EXISTS community_likes_post_idx ON public.community_likes (post_id, created_at DESC);
NOTIFY pgrst, 'reload schema';
