-- Experts Team schema repair: AI threads, community relations, and contact inbox.
-- Safe to apply more than once. Existing chat and community records are preserved.

-- AI chat threads: older installations may still have the original table without thread_id.
ALTER TABLE public.ai_chats
  ADD COLUMN IF NOT EXISTS thread_id uuid;

DO $$
DECLARE
  legacy_thread record;
BEGIN
  FOR legacy_thread IN
    SELECT user_id, gen_random_uuid() AS thread_id
    FROM public.ai_chats
    WHERE thread_id IS NULL
    GROUP BY user_id
  LOOP
    UPDATE public.ai_chats
    SET thread_id = legacy_thread.thread_id
    WHERE user_id = legacy_thread.user_id
      AND thread_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.ai_chats
  ALTER COLUMN thread_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN thread_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_chats_thread_user_created_idx
  ON public.ai_chats (user_id, thread_id, created_at ASC);

-- Ensure the community tables exist and have explicit profile relationships
-- for PostgREST's embedded profile selections.
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_posts_profile_fk'
      AND conrelid = 'public.community_posts'::regclass
  ) THEN
    ALTER TABLE public.community_posts
      ADD CONSTRAINT community_posts_profile_fk
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_comments_profile_fk'
      AND conrelid = 'public.community_comments'::regclass
  ) THEN
    ALTER TABLE public.community_comments
      ADD CONSTRAINT community_comments_profile_fk
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.community_posts, public.community_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts, public.community_comments TO authenticated;

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
      FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
      WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_posts' AND policyname='Users delete own community posts') THEN
    CREATE POLICY "Users delete own community posts" ON public.community_posts
      FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Community comments public read') THEN
    CREATE POLICY "Community comments public read" ON public.community_comments
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Users create community comments') THEN
    CREATE POLICY "Users create community comments" ON public.community_comments
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='community_comments' AND policyname='Users delete own community comments') THEN
    CREATE POLICY "Users delete own community comments" ON public.community_comments
      FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS community_posts_created_at_idx
  ON public.community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS community_comments_post_created_idx
  ON public.community_comments (post_id, created_at ASC);

-- Contact form inbox. Visitors can submit; only admins can read/manage messages.
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_messages' AND policyname='Anyone can send contact messages') THEN
    CREATE POLICY "Anyone can send contact messages" ON public.contact_messages
      FOR INSERT TO anon, authenticated
      WITH CHECK (
        char_length(trim(sender_name)) BETWEEN 1 AND 80
        AND char_length(trim(sender_email)) BETWEEN 3 AND 254
        AND char_length(trim(subject)) BETWEEN 1 AND 120
        AND char_length(trim(message)) BETWEEN 1 AND 4000
        AND (user_id IS NULL OR user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_messages' AND policyname='Admins read contact messages') THEN
    CREATE POLICY "Admins read contact messages" ON public.contact_messages
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_messages' AND policyname='Admins update contact messages') THEN
    CREATE POLICY "Admins update contact messages" ON public.contact_messages
      FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contact_messages' AND policyname='Admins delete contact messages') THEN
    CREATE POLICY "Admins delete contact messages" ON public.contact_messages
      FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON public.contact_messages (created_at DESC);
NOTIFY pgrst, 'reload schema';
