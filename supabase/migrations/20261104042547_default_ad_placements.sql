ALTER TABLE public.site_settings
  ALTER COLUMN ad_settings SET DEFAULT
  '{"nativeBannerEnabled":true,"popunderEnabled":true,"banner728Enabled":true,"placements":{"video-before":"nativeBanner","home-bottom":"banner728"}}'::jsonb;
