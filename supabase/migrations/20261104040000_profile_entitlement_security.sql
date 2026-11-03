-- Harden profile entitlements and prevent first-signup admin escalation.

CREATE OR REPLACE FUNCTION public.guard_profile_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Trusted database-owned functions and admins may grant or consume entitlements.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.ai_credits IS DISTINCT FROM OLD.ai_credits
     OR NEW.ai_subscribed IS DISTINCT FROM OLD.ai_subscribed
     OR NEW.ai_subscription_expires_at IS DISTINCT FROM OLD.ai_subscription_expires_at
     OR NEW.is_subscribed IS DISTINCT FROM OLD.is_subscribed
     OR NEW.storage_quota_bytes IS DISTINCT FROM OLD.storage_quota_bytes
     OR NEW.bonus_bytes IS DISTINCT FROM OLD.bonus_bytes THEN
    RAISE EXCEPTION 'Subscription and AI credit balances can only be changed by the platform.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_entitlements ON public.profiles;
CREATE TRIGGER profiles_guard_entitlements
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_entitlements();

-- Account removal must go through the trusted account-deletion flow.
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE DELETE ON public.profiles FROM authenticated;

-- Never grant administrator access merely because an account is the first signup.
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

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', final_username),
    NEW.raw_user_meta_data->>'avatar_url'
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
