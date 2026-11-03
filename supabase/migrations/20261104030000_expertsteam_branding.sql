-- Keep the public brand consistent with the ExpertsTeam product identity.
UPDATE public.site_settings
SET site_name = 'ExpertsTeam'
WHERE lower(trim(site_name)) IN ('chris programs', 'experts team', 'experts team 802');
NOTIFY pgrst, 'reload schema';
