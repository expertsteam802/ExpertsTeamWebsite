-- Enforce the configured subscription price and pending-only member submissions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_requests_kind_check'
      AND conrelid = 'public.subscription_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_requests
      ADD CONSTRAINT subscription_requests_kind_check
      CHECK (kind IN ('storage', 'ai')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.subscription_requests
  VALIDATE CONSTRAINT subscription_requests_kind_check;

CREATE OR REPLACE FUNCTION public.set_subscription_request_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  configured_price numeric(10,2);
BEGIN
  IF NEW.kind = 'ai' THEN
    SELECT ai_subscription_price INTO configured_price
    FROM public.site_settings
    WHERE id = 1;
  ELSE
    SELECT subscription_price INTO configured_price
    FROM public.site_settings
    WHERE id = 1;
  END IF;

  IF configured_price IS NULL OR configured_price <= 0 THEN
    RAISE EXCEPTION 'The selected subscription plan is not configured.';
  END IF;

  -- Never trust a price sent by the browser.
  NEW.amount := configured_price;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_requests_set_amount ON public.subscription_requests;
CREATE TRIGGER subscription_requests_set_amount
  BEFORE INSERT OR UPDATE OF amount, kind
  ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_request_amount();

REVOKE ALL ON FUNCTION public.set_subscription_request_amount() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
