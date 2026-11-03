
-- Experts Team: community, AI chat and uploads schema
-- Safe to run repeatedly. Existing user data is preserved.

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'post',
  title text NOT NULL,
  body text,
  link_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled snippet',
  language text NOT NULL DEFAULT 'javascript',
  prompt text,
  code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_snippets ENABLE ROW LEVEL SECURITY;

-- Community posts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_posts' AND policyname='Community posts public read') THEN
    CREATE POLICY "Community posts public read" ON public.community_posts
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_posts' AND policyname='Users create community posts') THEN
    CREATE POLICY "Users create community posts" ON public.community_posts
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_posts' AND policyname='Users update own community posts') THEN
    CREATE POLICY "Users update own community posts" ON public.community_posts
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
      WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_posts' AND policyname='Users delete own community posts') THEN
    CREATE POLICY "Users delete own community posts" ON public.community_posts
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Community comments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Community comments public read') THEN
    CREATE POLICY "Community comments public read" ON public.community_comments
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Users create community comments') THEN
    CREATE POLICY "Users create community comments" ON public.community_comments
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Users update own community comments') THEN
    CREATE POLICY "Users update own community comments" ON public.community_comments
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
      WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Users delete own community comments') THEN
    CREATE POLICY "Users delete own community comments" ON public.community_comments
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- AI conversations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_chats' AND policyname='Users read own chats') THEN
    CREATE POLICY "Users read own chats" ON public.ai_chats
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_chats' AND policyname='Users create own chats') THEN
    CREATE POLICY "Users create own chats" ON public.ai_chats
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_chats' AND policyname='Users update own chats') THEN
    CREATE POLICY "Users update own chats" ON public.ai_chats
      FOR UPDATE TO authenticated USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_chats' AND policyname='Users delete own chats') THEN
    CREATE POLICY "Users delete own chats" ON public.ai_chats
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Saved code snippets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_snippets' AND policyname='Users read own snippets') THEN
    CREATE POLICY "Users read own snippets" ON public.ai_snippets
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_snippets' AND policyname='Users create own snippets') THEN
    CREATE POLICY "Users create own snippets" ON public.ai_snippets
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_snippets' AND policyname='Users update own snippets') THEN
    CREATE POLICY "Users update own snippets" ON public.ai_snippets
      FOR UPDATE TO authenticated USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_snippets' AND policyname='Users delete own snippets') THEN
    CREATE POLICY "Users delete own snippets" ON public.ai_snippets
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS community_posts_created_at_idx
  ON public.community_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS community_comments_post_created_idx
  ON public.community_comments (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ai_chats_user_created_idx
  ON public.ai_chats (user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ai_snippets_user_updated_idx
  ON public.ai_snippets (user_id, updated_at DESC);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_touch ON public.community_posts;
CREATE TRIGGER community_posts_touch
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS ai_snippets_touch ON public.ai_snippets;
CREATE TRIGGER ai_snippets_touch
  BEFORE UPDATE ON public.ai_snippets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Keep the existing uploads bucket public for compatibility with
-- existing public upload URLs. Access to uploads is restricted by folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 209715200)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Uploads readable by all') THEN
    CREATE POLICY "Uploads readable by all" ON storage.objects
      FOR SELECT USING (bucket_id = 'uploads');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users upload to own folder') THEN
    CREATE POLICY "Users upload to own folder" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users update own uploads') THEN
    CREATE POLICY "Users update own uploads" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users delete own uploads') THEN
    CREATE POLICY "Users delete own uploads" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'uploads'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
