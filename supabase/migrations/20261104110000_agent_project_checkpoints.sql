-- Persistent ExpertAI project checkpoints for safe rollback.
CREATE TABLE IF NOT EXISTS public.agent_project_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Before AI change',
  files jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_project_checkpoints ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.agent_project_checkpoints TO authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_project_checkpoints' AND policyname='Owners read own checkpoints') THEN
    CREATE POLICY "Owners read own checkpoints" ON public.agent_project_checkpoints
      FOR SELECT TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.agent_projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_project_checkpoints' AND policyname='Owners create own checkpoints') THEN
    CREATE POLICY "Owners create own checkpoints" ON public.agent_project_checkpoints
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.agent_projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_project_checkpoints' AND policyname='Owners delete own checkpoints') THEN
    CREATE POLICY "Owners delete own checkpoints" ON public.agent_project_checkpoints
      FOR DELETE TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.agent_projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS agent_project_checkpoints_project_created_idx ON public.agent_project_checkpoints (project_id, created_at DESC);
