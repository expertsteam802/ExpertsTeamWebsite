# ExpertsTeam Plugin Center setup

The Plugin Center stores per-user plugin connections, granular action permissions, and a private audit-log stream. OAuth credentials are stored as JSON secrets in Supabase Vault; the browser receives only connection metadata.

## Required server environment

Set these as server-only Vercel environment variables (never use a `VITE_` prefix):

- `PLUGIN_OAUTH_STATE_SECRET`: at least 32 random characters. Use a unique cryptographically random value.
- `APP_URL`: `https://expertsteam.giize.com` in production.
- `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`: credentials for an ExpertsTeam GitHub OAuth App.
- `SUPABASE_OAUTH_CLIENT_ID` and `SUPABASE_OAUTH_CLIENT_SECRET`: credentials for an ExpertsTeam OAuth application registered in Supabase.

The existing server-side Supabase service credential must also be configured because OAuth callbacks store encrypted credentials through a service-role-only RPC.

## GitHub OAuth App

Register an OAuth App in GitHub Developer Settings:

- Homepage URL: `https://expertsteam.giize.com`
- Authorization callback URL: `https://expertsteam.giize.com/api/plugins/github/callback`
- Requested scopes: `repo read:user user:email`

Add its client ID and secret to Vercel as the GitHub environment variables above. For local development, set `APP_URL` to the local origin and register that exact callback URL in a development OAuth App.

## Supabase Management OAuth

Register an OAuth application in the Supabase organization that owns the ExpertsTeam integration. Set its redirect URI to:

`https://expertsteam.giize.com/api/plugins/supabase/callback`

The integration uses the official Supabase authorization endpoint and authorization-code + PKCE flow. Configure the minimum Management API scopes needed by the integration in the OAuth application settings, then add its client ID and secret to Vercel.

## Callback endpoints

- GitHub: `/api/plugins/github/callback`
- Supabase: `/api/plugins/supabase/callback`

## Security model

- OAuth state is signed, time-limited, provider-bound, and includes a PKCE verifier for Supabase.
- OAuth access/refresh tokens are saved in Supabase Vault, not returned to the browser.
- Plugin connection rows are owner-readable only.
- Permission rows are owner-readable/writable only.
- Destructive actions are marked as approval-required in the permission policy and must be confirmed by the action executor before execution.
- Revocation removes the connection row and its Vault secret.

## Current implementation boundary

This first connection pass wires GitHub and Supabase Management OAuth, encrypted token persistence, per-user action permissions, and revocation. The provider-specific action executors (GitHub repository operations and Supabase Management API/database operations) must check the permission row on every operation and write an audit event. Do not expose a raw token to the Agent prompt or browser.
