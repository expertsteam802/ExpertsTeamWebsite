ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS ai_free_credits integer NOT NULL DEFAULT 25;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_ai_free_credits_range
  CHECK (ai_free_credits BETWEEN 0 AND 100000);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  final_username text;
  suffix integer := 0;
  assigned_role public.app_role;
  initial_ai_credits integer;
BEGIN
  base_username := lower(regexp_replace(
    coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user'),
    '[^a-z0-9_]', '', 'g'));
  IF base_username = '' THEN base_username := 'user'; END IF;
  final_username := base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;

  SELECT ai_free_credits INTO initial_ai_credits
  FROM public.site_settings
  ORDER BY id
  LIMIT 1;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, ai_credits)
  VALUES (
    NEW.id,
    final_username,
    coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', final_username),
    NEW.raw_user_meta_data->>'avatar_url',
    coalesce(initial_ai_credits, 25)
  );

  assigned_role := CASE
    WHEN lower(coalesce(NEW.email, '')) = 'expertsteam2011@gmail.com'
      THEN 'admin'::public.app_role
    ELSE 'member'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
