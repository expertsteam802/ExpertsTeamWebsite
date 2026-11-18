CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN false;
  END IF;

  IF _role = 'admin'::public.app_role THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'creator'::public.app_role)
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

DROP POLICY IF EXISTS "Admins add roles" ON public.user_roles;
CREATE POLICY "Admins add roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  AND (
    public.has_role((SELECT auth.uid()), 'creator'::public.app_role)
    OR role <> 'creator'::public.app_role
  )
);

DROP POLICY IF EXISTS "Admins remove roles" ON public.user_roles;
CREATE POLICY "Admins remove roles" ON public.user_roles
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  AND user_id <> (SELECT auth.uid())
  AND (
    public.has_role((SELECT auth.uid()), 'creator'::public.app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles AS protected_role
      WHERE protected_role.user_id = user_roles.user_id
        AND protected_role.role = 'creator'::public.app_role
    )
  )
);

CREATE OR REPLACE FUNCTION public.assign_expertsteam_creator_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'expertsteam2011@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'creator'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_expertsteam_creator_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created_assign_expertsteam_creator ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_expertsteam_creator
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.assign_expertsteam_creator_role();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'creator'::public.app_role
FROM auth.users
WHERE lower(email) = 'expertsteam2011@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.site_settings
SET owner_email = 'expertsteam2011@gmail.com', updated_at = now()
WHERE id = 1;
