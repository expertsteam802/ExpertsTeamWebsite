-- Advertising integrations and placement settings have been removed.
-- Keep only the site branding JSON on site_settings.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'ad_settings'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'site_branding_settings'
  ) THEN
    ALTER TABLE public.site_settings RENAME COLUMN ad_settings TO site_branding_settings;
  END IF;
END $$;

UPDATE public.site_settings
SET site_branding_settings = jsonb_build_object(
  'banner_image_url', COALESCE(site_branding_settings #>> '{siteBranding,banner_image_url}', ''),
  'background_image_url', COALESCE(site_branding_settings #>> '{siteBranding,background_image_url}', '')
)
WHERE site_branding_settings ? 'siteBranding';
