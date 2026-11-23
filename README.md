Guest ExpertAI chat tries Groq first and falls back to OpenRouter through a server-side adapter; signed-in ExpertAI and the coding agent use the configured server-side AI gateway. Guest chat requires `GROQ_API_KEY` or `OPENROUTER_API_KEY`, plus server-side Supabase service credentials for guest limits. Keep every provider key server-only: never prefix it with `VITE_`, expose it to the browser, or commit it. Provider quotas and free-model availability can change; Supabase separately enforces the guest allowance.

## Authentication configuration

Google sign-in and email/password authentication are handled by Supabase Auth:

- The active schema migrations are in `supabase/migrations/`. This project has a legacy baseline and an existing migration ledger that must be reconciled before replaying migrations. **Do not run `supabase db push` blindly** against production; first compare the migration ledger and live schema using `docs/DB_MIGRATION_AUDIT.md`.
- The migrations grant the admin role to the account with the configured creator email, including accounts created after the migrations are applied. They do not create or set an account password; create/sign in to that account through Supabase Auth and keep its password private.
- In Supabase, enable Google under **Authentication → Providers → Google** and add the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the OAuth client in Google Cloud.
- Under **Authentication → URL Configuration**, set the site URL and allow the local app URL (`http://localhost:5173/**`) and your deployed app URL as redirects.
- To allow users to sign up without verifying their email, disable **Confirm email** under **Authentication → Providers → Email** in Supabase. With confirmation enabled, Supabase does not create an authenticated session after signup.

Guest ExpertAI tries Groq (`GROQ_API_KEY`) first and uses OpenRouter (`OPENROUTER_API_KEY`) as fallback; signed-in chat and the coding agent use the configured server-side AI gateway. Supabase provider, redirect, and server environment settings must match the active project. See `docs/AI_PROVIDER_SETUP.md` for the required server-only variables and guest-chat verification steps.

## Production deployment

The website is connected to Vercel. Pushes to `main` should trigger the production deployment through the Vercel Git integration. Verify the resulting deployment in the Vercel project dashboard before announcing a release. The repository's `.github/workflows/ci.yml` runs tests, lint and a production build; it does not deploy to Vercel.

Keep Vercel environment variables configured for the correct environments (Production, Preview and Development). AI provider keys and Supabase secret/service-role keys must remain server-only and must never use a `VITE_*` prefix.

