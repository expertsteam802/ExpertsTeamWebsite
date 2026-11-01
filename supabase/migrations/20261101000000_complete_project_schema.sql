CREATE TABLE IF NOT EXISTS public.team_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Developer',
  email text,
  phone text,
  link text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_contacts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_contacts TO authenticated;
GRANT ALL ON public.team_contacts TO service_role;
ALTER TABLE public.team_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Contacts public read" ON public.team_contacts;
CREATE POLICY "Contacts public read" ON public.team_contacts
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage contacts" ON public.team_contacts;
CREATE POLICY "Admins manage contacts" ON public.team_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS team_contacts_sort_order_idx
  ON public.team_contacts (sort_order, created_at);
INSERT INTO public.team_contacts (name, role, email, link, sort_order)
SELECT 'Chris Expert - M.Chris.T', 'Creator & Founder', 'mucyochristhecla@gmail.com',
       'https://www.youtube.com/@expertchris', 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_contacts WHERE name = 'Chris Expert - M.Chris.T'
);

CREATE TABLE IF NOT EXISTS public.agent_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Untitled app',
  files jsonb NOT NULL DEFAULT '{}'::jsonb,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  slug text UNIQUE,
  github_repo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_projects TO authenticated;
GRANT ALL ON public.agent_projects TO service_role;
ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Published apps are public" ON public.agent_projects;
CREATE POLICY "Published apps are public" ON public.agent_projects
  FOR SELECT TO anon, authenticated USING (published = true);
DROP POLICY IF EXISTS "Owners read own apps" ON public.agent_projects;
CREATE POLICY "Owners read own apps" ON public.agent_projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners create apps" ON public.agent_projects;
CREATE POLICY "Owners create apps" ON public.agent_projects
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners update apps" ON public.agent_projects;
CREATE POLICY "Owners update apps" ON public.agent_projects
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners or admins delete apps" ON public.agent_projects;
CREATE POLICY "Owners or admins delete apps" ON public.agent_projects
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS agent_projects_user_updated_idx
  ON public.agent_projects (user_id, updated_at DESC);
CREATE OR REPLACE FUNCTION public.touch_agent_project()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS agent_projects_touch ON public.agent_projects;
CREATE TRIGGER agent_projects_touch
  BEFORE UPDATE ON public.agent_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_project();

GRANT INSERT, DELETE ON public.user_roles TO authenticated;
DROP POLICY IF EXISTS "Admins add roles" ON public.user_roles;
CREATE POLICY "Admins add roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins remove roles" ON public.user_roles;
CREATE POLICY "Admins remove roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id <> auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 209715200)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_configured_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'expertsteam2011@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_configured_admin() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS grant_configured_admin ON auth.users;
CREATE TRIGGER grant_configured_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_configured_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'expertsteam2011@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

NOTIFY pgrst, 'reload schema';
