# Project environment variables and Supabase connections

Each Builder project has its own environment-variable namespace. Values are encrypted with AES-256-GCM before they are written to the platform database. The browser can list variable names and timestamps, but it cannot read saved values.

## Deployment setup

1. Generate a 32-byte key, for example with `openssl rand -hex 32`.
2. Add the result to the server-only deployment environment as `PROJECT_SECRET_ENCRYPTION_KEY`. Do not use a `VITE_` prefix and do not commit the value.
3. Apply `supabase/migrations/20261123210000_project_environment_secrets.sql` to the ExpertsTeam platform database.
4. Redeploy the application.

Without the encryption key, save operations fail closed. Do not rotate the key unless existing encrypted project values have been migrated, because old values cannot be decrypted with a new key.

## Connecting a user's own Supabase project

Open **Connections & Integrations** and connect the Supabase project you own. ExpertsTeam verifies the URL and public key, stores the publishable key with the connection metadata, and stores the optional server secret in Supabase Vault. Then select that connection in the ExpertAI Studio project header. The selected project's public URL and publishable key are passed into its Daytona preview and static production build. Use **Environment** for other project-specific variables or explicit public overrides.

For a Vite or Next.js app configured manually, the public variable names are:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY` for the legacy public anon key)
- `SUPABASE_SECRET_KEY` only for future server-side operations that genuinely require elevated access

Never add a service-role/secret key to a browser-visible `VITE_*` variable. The platform stores the connection metadata in its control-plane database and stores the optional secret in Supabase Vault; the Supabase URL and keys still point to the project owner's separate Supabase project. They are not written into project source files.

## Current implementation boundary

This release provides project ownership checks, AES-256-GCM encrypted storage, key-name listing, replacement, and deletion. Only the allowlisted public Supabase settings (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, and their `NEXT_PUBLIC_*` equivalents) are passed into the Daytona preview process and static production build. Those values are public by design and will be visible in the browser bundle.

Private variables such as `SUPABASE_SECRET_KEY` are decrypted only in server code and are passed to the user's isolated Daytona interactive terminal process when that project terminal starts. They are not included in browser builds, preview processes, project source files, or environment-variable list responses. A coding CLI running inside that user's terminal can read the terminal environment, so users should only add credentials they intend to make available to their own project workspace. The current publishing target is static hosting, so private server-side credentials are not consumed by that target. A future server-hosting adapter must retrieve them only inside trusted server code. Never return `loadProjectEnvironment` results from a browser-callable server function.
