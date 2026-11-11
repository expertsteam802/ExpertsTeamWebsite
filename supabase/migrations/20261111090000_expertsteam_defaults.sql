-- Keep new site_settings rows aligned with the current ExpertsTeam identity.
ALTER TABLE public.site_settings
  ALTER COLUMN site_name SET DEFAULT 'ExpertsTeam',
  ALTER COLUMN tagline SET DEFAULT 'Learn. Code. Play. Create.',
  ALTER COLUMN instagram_url SET DEFAULT 'https://instagram.com/m_chris_t',
  ALTER COLUMN subscription_price SET DEFAULT 1.00,
  ALTER COLUMN subscription_quota_bytes SET DEFAULT 240000000,
  ALTER COLUMN ai_subscription_price SET DEFAULT 1.00,
  ALTER COLUMN ai_subscription_credits SET DEFAULT 100000;
