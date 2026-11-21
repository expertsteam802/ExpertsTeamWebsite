-- Reset an exhausted free AI allowance to the current admin-configured baseline.
-- This does not add bonus credits and never overwrites an active subscription allowance.
CREATE OR REPLACE FUNCTION public.claim_free_ai_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_allowance integer;
  v_remaining integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to claim free AI credits.';
  END IF;

  SELECT ai_free_credits
    INTO v_allowance
    FROM public.site_settings
    ORDER BY id
    LIMIT 1;

  IF COALESCE(v_allowance, 0) < 1 THEN
    RAISE EXCEPTION 'Free AI credits are not currently available.';
  END IF;

  UPDATE public.profiles
     SET ai_credits = v_allowance
   WHERE id = v_user
     AND ai_credits < 1
     AND NOT (
       ai_subscribed
       AND ai_subscription_expires_at IS NOT NULL
       AND ai_subscription_expires_at > now()
     )
  RETURNING ai_credits INTO v_remaining;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'You still have credits, or an active subscription manages your allowance.';
  END IF;

  RETURN v_remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_ai_credits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_free_ai_credits() TO authenticated;

NOTIFY pgrst, 'reload schema';
