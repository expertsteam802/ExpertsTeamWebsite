-- Keep guest usage counters out of the public Data API schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

ALTER TABLE public.guest_ai_usage SET SCHEMA private;
GRANT ALL ON TABLE private.guest_ai_usage TO service_role;

CREATE OR REPLACE FUNCTION public.consume_guest_ai_credit(p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
DECLARE
  current_credits integer;
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) < 32 OR length(p_ip_hash) > 128 THEN
    RAISE EXCEPTION 'Invalid guest usage key';
  END IF;

  INSERT INTO private.guest_ai_usage (ip_hash, credits_used, reset_at)
  VALUES (p_ip_hash, 1, now() + interval '24 hours')
  ON CONFLICT (ip_hash) DO UPDATE
    SET credits_used = CASE
          WHEN private.guest_ai_usage.reset_at <= now() THEN 1
          ELSE private.guest_ai_usage.credits_used + 1
        END,
        reset_at = CASE
          WHEN private.guest_ai_usage.reset_at <= now() THEN now() + interval '24 hours'
          ELSE private.guest_ai_usage.reset_at
        END,
        updated_at = now()
  RETURNING credits_used INTO current_credits;

  RETURN current_credits <= 15;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_ai_credit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_ai_credit(text) TO service_role;
