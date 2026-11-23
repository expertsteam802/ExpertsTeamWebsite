# Project environment variables and Supabase connections

Each Builder project has its own environment-variable namespace. Values are encrypted with AES-256-GCM before they are written to the platform database. The browser can list variable names and timestamps, but it cannot read saved values.

## Deployment setup

1. Generate a 32-byte key, for example with `openssl rand -hex 32`.
2. Add the result to the server-only deployment environment as `PROJECT_SECRET_ENCRYPTION_KEY`. Do not use a `VITE_` prefix and do not commit the value.
3. Apply `supabase/migrations/20261123200000_project_environment_secrets.sql` to the ExpertsTeam platform database.
4. Redeploy the application.

Without the encryption key, save operations fail closed. Do not rotate the key unless existing encrypted project values have been migrated, because old values cannot be decrypted with a new key.

## Connecting a user's own Supabase project

In ExpertAI Studio, open a project and choose **Environment**. Add the credentials for that project's own Supabase instance:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY` for the legacy public anon key)
- `SUPABASE_SECRET_KEY` only for future server-side operations that genuinely require elevated access

Never add a service-role/secret key to a browser-visible `VITE_*` variable. The platform stores the values encrypted in its own control-plane database; the Supabase URL and keys still point to the project owner's separate Supabase project. They are not written into project source files.

## Current implementation boundary

This release provides project ownership checks, AES-256-GCM encrypted storage, key-name listing, replacement, and deletion. Only the allowlisted public Supabase settings (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, and their `NEXT_PUBLIC_*` equivalents) are passed into the Daytona preview process and static production build. Those values are public by design and will be visible in the browser bundle.

Private variables such as `SUPABASE_SECRET_KEY` remain encrypted and are not injected into the browser build, preview shell, or AI coding terminal. The current publishing target is static hosting, so private server-side credentials are not consumed by that target. A future server-hosting adapter must retrieve them only inside trusted server code. Environment values are never returned by the list action; never return `loadProjectEnvironment` results from a browser-callable server function.
