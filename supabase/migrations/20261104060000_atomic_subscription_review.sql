-- Review a subscription payment and grant its entitlement atomically.
-- The caller must be an authenticated admin; no client may directly grant credits/quota.
CREATE OR REPLACE FUNCTION public.admin_review_subscription_request(
  p_request_id uuid,
  p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_request public.subscription_requests%ROWTYPE;
  studio_credits integer;
  storage_quota bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can review payments.';
  END IF;

  SELECT *
  INTO payment_request
  FROM public.subscription_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request was not found.';
  END IF;
  IF payment_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This payment request has already been reviewed.';
  END IF;

  IF p_approve THEN
    SELECT ai_subscription_credits, subscription_quota_bytes
    INTO studio_credits, storage_quota
    FROM public.site_settings
    WHERE id = 1;

    IF payment_request.kind = 'ai' THEN
      UPDATE public.profiles
      SET ai_subscribed = true,
          ai_credits = GREATEST(COALESCE(studio_credits, 500), 1),
          ai_subscription_expires_at = now() + interval '30 days'
      WHERE id = payment_request.user_id;
    ELSE
      UPDATE public.profiles
      SET is_subscribed = true,
          storage_quota_bytes = GREATEST(COALESCE(storage_quota, 2147483648), 1)
      WHERE id = payment_request.user_id;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The member account for this payment no longer exists.';
    END IF;
  END IF;

  UPDATE public.subscription_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_subscription_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_subscription_request(uuid, boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
