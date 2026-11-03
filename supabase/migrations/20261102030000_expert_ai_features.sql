
-- Experts Team AI Studio
-- Workspace metadata and project execution history.
-- Additive and safe to re-run.

-- Extend the existing project table.
ALTER TABLE public.agent_projects
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS framework text NOT NULL DEFAULT 'vite',
  ADD COLUMN IF NOT EXISTS repository_url text,
  ADD COLUMN IF NOT EXISTS default_branch text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS workspace_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_build_status text NOT NULL DEFAULT 'not_run',
  ADD COLUMN IF NOT EXISTS last_build_at timestamptz,
  ADD COLUMN IF NOT EXISTS deployment_url text;

-- Validate build status values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agent_projects'::regclass
      AND conname = 'agent_projects_build_status_check'
  ) THEN
    ALTER TABLE public.agent_projects
      ADD CONSTRAINT agent_projects_build_status_check
      CHECK (last_build_status IN (
        'not_run', 'queued', 'running', 'success', 'failed'
      ));
  END IF;
END $$;

-- Execution/build/deployment history.
-- Do not store raw terminal output or credentials in this table.
CREATE TABLE IF NOT EXISTS public.agent_project_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL
    REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  exit_code integer,
  summary text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_project_runs_type_check
    CHECK (run_type IN ('build', 'test', 'deploy', 'install', 'command')),

  CONSTRAINT agent_project_runs_status_check
    CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS agent_project_runs_project_created_idx
  ON public.agent_project_runs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_project_runs_user_created_idx
  ON public.agent_project_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_projects_user_updated_idx
  ON public.agent_projects (user_id, updated_at DESC);

-- Run records are private to their owner.
ALTER TABLE public.agent_project_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.agent_project_runs TO authenticated;

GRANT ALL ON public.agent_project_runs TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_project_runs'
      AND policyname = 'Owners read own project runs'
  ) THEN
    CREATE POLICY "Owners read own project runs"
      ON public.agent_project_runs
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_project_runs'
      AND policyname = 'Owners create own project runs'
  ) THEN
    CREATE POLICY "Owners create own project runs"
      ON public.agent_project_runs
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.agent_projects p
          WHERE p.id = project_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_project_runs'
      AND policyname = 'Owners update own project runs'
  ) THEN
    CREATE POLICY "Owners update own project runs"
      ON public.agent_project_runs
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.agent_projects p
          WHERE p.id = project_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_project_runs'
      AND policyname = 'Owners delete own project runs'
  ) THEN
    CREATE POLICY "Owners delete own project runs"
      ON public.agent_project_runs
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Keep project timestamps current.
CREATE OR REPLACE FUNCTION public.touch_agent_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_projects_touch
  ON public.agent_projects;

CREATE TRIGGER agent_projects_touch
  BEFORE UPDATE ON public.agent_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_project();

NOTIFY pgrst, 'reload schema';
