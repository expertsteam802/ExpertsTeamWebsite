# Agent Studio deployments

## Production subdomains

The production publisher supports first-party project subdomains when the hosting provider is configured for wildcard routing.

1. Add `PUBLIC_APP_DOMAIN=expertsteam.giize.com` as a server environment variable.
2. Configure the hosting project to accept `*.expertsteam.giize.com` and provision a wildcard TLS certificate.
3. Add the wildcard DNS record recommended by the hosting provider (usually a CNAME to the site's assigned hostname). Do not guess the target; copy it from the hosting dashboard.
4. Confirm `https://test-project.expertsteam.giize.com` reaches the ExpertsTeam site before publishing real projects.

When `PUBLIC_APP_DOMAIN` is absent, production continues to use the safe path URL `https://expertsteam.giize.com/apps/{slug}`. The server rewrites valid first-party subdomains to the existing published-app route, preserving the browser's subdomain URL.

## Staging and rollback

- Choose `staging` or `production` when deploying from the Studio toolbar.
- Staging requires an owner-set password of at least eight characters. The server stores a salted scrypt hash, never the plaintext password.
- Staging releases are stored separately from production releases and are opened at `/staging/{slug}`. The password is checked server-side before the staging asset URL is returned.
- Every successful deploy is recorded as an immutable release with its environment, release ID, asset URL and public URL.
- The Deploy history menu lists releases. Owners can roll production back to any earlier successful production release; rollback switches the active release pointer without rebuilding or deleting the stored assets.

## Required server variables

- `APP_URL`: canonical ExpertsTeam app origin, e.g. `https://expertsteam.giize.com`.
- `PUBLIC_APP_DOMAIN`: optional hostname only (no scheme or path) for wildcard project subdomains.
- `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, and `NETLIFY_SITE_HOSTNAME`: required for the custom-domain workflow. `NETLIFY_SITE_HOSTNAME` is the site's assigned `.netlify.app` hostname.
- `NETLIFY_LOAD_BALANCER_IPS`: optional comma-separated A-record targets; defaults to `75.2.60.5` for standard Netlify external DNS.

The wildcard DNS record and wildcard TLS certificate must be configured in the hosting provider before enabling subdomain publishing. The code does not create DNS records or certificates automatically.

## Traffic and build diagnostics

Published-app loads and load failures are aggregated by project and UTC day. The Studio history menu shows the last 30 days of views and load errors, plus the latest successful or failed build log entries. Analytics stores aggregate counts only; it does not store visitor IP addresses or full user-agent strings.

## Custom domains

The Studio's Custom domains panel supports domain ownership verification, Netlify domain-alias registration, DNS checks and SSL provisioning.

1. Add the domain in the panel.
2. Create the displayed TXT record at the displayed verification host.
3. Point a subdomain with a CNAME to the site's `NETLIFY_SITE_HOSTNAME`. For an apex/root domain, use an ALIAS/ANAME to `apex-loadbalancer.netlify.com` or the Netlify A-record target shown by the hosting dashboard.
4. Select Verify DNS / SSL. The server verifies the TXT token before calling the Netlify API, then checks the DNS target and triggers SSL provisioning.
5. Once the record is active, requests for that hostname are rewritten to the matching published project.

Netlify requires DNS to point to its infrastructure before it can issue a certificate. SSL may remain pending while DNS propagates; retry verification after the DNS records are visible. See [Netlify's API guide for adding domains](https://developers.netlify.com/guides/adding-your-domain-using-netlify-api/) and [HTTPS/SSL documentation](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/).

## Database backup inventory

The Admin → Database backups panel reads the Supabase Management API. Configure server-only `SUPABASE_ACCESS_TOKEN` with the `database:read` / `backups_read` scope and `SUPABASE_PROJECT_REF`. The panel is read-only and links to Supabase for restore operations; it never triggers a destructive restore from the app. Backup availability and retention depend on the Supabase plan.

## Cron builder

The Studio toolbar includes a visual cron builder for common schedules and custom five-field expressions. It generates SQL for the developer's own Supabase SQL Editor, including optional `pg_net` calls to Edge Functions. The builder deliberately does not execute arbitrary user SQL against the shared ExpertsTeam database. For HTTP jobs, store the generated secret in Supabase Vault and have the Edge Function validate the `x-cron-secret` header.

## Uptime alerts

The ExpertsTeam Supabase project enables `pg_cron` and `pg_net`. Production uptime monitoring can be enabled per project from Deploy history. A scheduled job checks the current published storage release every five minutes; a second job processes HTTP responses every minute. Owners can set consecutive failure and recovery thresholds and acknowledge down/recovered alerts in Studio. Checks are retained for 30 days. Alerts are currently in-app; email delivery is not enabled by this migration.
