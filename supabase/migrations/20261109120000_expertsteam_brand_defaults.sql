-- Make the ExpertsTeam identity the persistent default for new settings rows.
alter table public.site_settings
  alter column site_name set default 'ExpertsTeam',
  alter column tagline set default 'Learn. Code. Play. Create.';

update public.site_settings
set site_name = 'ExpertsTeam',
    tagline = 'Learn. Code. Play. Create.',
    logo_url = null,
    updated_at = now()
where id = 1;
