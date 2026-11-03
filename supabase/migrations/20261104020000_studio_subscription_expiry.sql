-- Monthly Studio access expiry. Manual renewals are reviewed by an admin.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_subscription_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.consume_ai_credit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to use Studio AI.';
  END IF;

  UPDATE public.profiles
  SET ai_subscribed = false,
      ai_credits = LEAST(ai_credits, 25),
      ai_subscription_expires_at = NULL
  WHERE id = auth.uid()
    AND ai_subscribed = true
    AND ai_subscription_expires_at IS NOT NULL
    AND ai_subscription_expires_at <= now();

  UPDATE public.profiles
  SET ai_credits = ai_credits - 1
  WHERE id = auth.uid()
    AND ai_credits > 0
  RETURNING ai_credits INTO remaining;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'You have no AI credits remaining. Upgrade your Studio plan or wait for your allowance to renew.';
  END IF;

  RETURN remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit() TO authenticated;
NOTIFY pgrst, 'reload schema';
