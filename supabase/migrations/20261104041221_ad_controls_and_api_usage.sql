ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS ad_settings jsonb NOT NULL DEFAULT
    '{"nativeBannerEnabled":true,"popunderEnabled":true,"banner728Enabled":true,"placements":{"video-before":"nativeBanner"}}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_dialog_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.api_request_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('rest', 'auth', 'storage', 'realtime', 'functions')),
  endpoint text NOT NULL CHECK (char_length(endpoint) <= 255),
  method text NOT NULL CHECK (char_length(method) <= 12),
  status_code smallint NOT NULL CHECK (status_code BETWEEN 0 AND 599),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  request_bytes integer NOT NULL DEFAULT 0 CHECK (request_bytes >= 0),
  response_bytes integer NOT NULL DEFAULT 0 CHECK (response_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_request_usage_created_at_idx
  ON public.api_request_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS api_request_usage_endpoint_created_idx
  ON public.api_request_usage (endpoint, created_at DESC);

ALTER TABLE public.api_request_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'api_request_usage'
      AND policyname = 'Users record own API usage'
  ) THEN
    CREATE POLICY "Users record own API usage"
      ON public.api_request_usage FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'api_request_usage'
      AND policyname = 'Admins read API usage'
  ) THEN
    CREATE POLICY "Admins read API usage"
      ON public.api_request_usage FOR SELECT TO authenticated
      USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
  END IF;
END
$$;

GRANT INSERT, SELECT ON TABLE public.api_request_usage TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_api_usage_summary(
  p_since timestamptz DEFAULT now() - interval '7 days'
)
RETURNS TABLE (
  service text,
  endpoint text,
  method text,
  request_count bigint,
  error_count bigint,
  average_duration_ms numeric,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    usage.service,
    usage.endpoint,
    usage.method,
    count(*)::bigint,
    count(*) FILTER (WHERE usage.status_code >= 400 OR usage.status_code = 0)::bigint,
    round(avg(usage.duration_ms)::numeric, 1),
    max(usage.created_at)
  FROM public.api_request_usage AS usage
  WHERE usage.created_at >= COALESCE(p_since, now() - interval '7 days')
  GROUP BY usage.service, usage.endpoint, usage.method
  ORDER BY count(*) DESC, max(usage.created_at) DESC
$$;

REVOKE ALL ON FUNCTION public.admin_api_usage_summary(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_api_usage_summary(timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
