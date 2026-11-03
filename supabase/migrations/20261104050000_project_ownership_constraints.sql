-- Final schema hardening for Studio ownership and trigger function exposure.
REVOKE ALL ON FUNCTION public.guard_profile_entitlements() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_projects_user_fk'
      AND conrelid = 'public.agent_projects'::regclass
  ) THEN
    ALTER TABLE public.agent_projects
      ADD CONSTRAINT agent_projects_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_project_runs_user_fk'
      AND conrelid = 'public.agent_project_runs'::regclass
  ) THEN
    ALTER TABLE public.agent_project_runs
      ADD CONSTRAINT agent_project_runs_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
