-- ExpertsTeam Studio subscription plan: $1/month with configurable AI credits.
-- This migration is additive and safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_credits integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS ai_subscribed boolean NOT NULL DEFAULT false;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS ai_subscription_price numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_subscription_credits integer NOT NULL DEFAULT 500;

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'storage';

ALTER TABLE public.site_settings
  ALTER COLUMN ai_subscription_price SET DEFAULT 1;

-- 0.50 was the legacy default; move those installations to the requested $1 plan.
UPDATE public.site_settings
SET ai_subscription_price = 1
WHERE ai_subscription_price IS NULL OR ai_subscription_price <= 0 OR ai_subscription_price = 0.5;

UPDATE public.site_settings
SET ai_subscription_credits = 500
WHERE ai_subscription_credits IS NULL OR ai_subscription_credits < 1;

UPDATE public.subscription_requests
SET kind = 'storage'
WHERE kind IS NULL OR kind NOT IN ('storage', 'ai');

NOTIFY pgrst, 'reload schema';
