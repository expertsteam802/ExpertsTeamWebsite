CREATE OR REPLACE FUNCTION public.can_use_guest_ai_credit(p_ip_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
  SELECT COALESCE(
    (
      SELECT credits_used < 15 AND reset_at > now()
      FROM private.guest_ai_usage
      WHERE ip_hash = p_ip_hash
    ),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.can_use_guest_ai_credit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_guest_ai_credit(text) TO service_role;
