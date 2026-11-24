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

The wildcard DNS record and wildcard TLS certificate must be configured in the hosting provider before enabling subdomain publishing. The code does not create DNS records or certificates automatically.

## Traffic and build diagnostics

Published-app loads and load failures are aggregated by project and UTC day. The Studio history menu shows the last 30 days of views and load errors, plus the latest successful or failed build log entries. Analytics stores aggregate counts only; it does not store visitor IP addresses or full user-agent strings.
