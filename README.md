Guest ExpertAI chat uses OpenRouter through a server-side adapter; signed-in ExpertAI and the coding agent currently use the Kilo AI Gateway. Guest chat requires `OPENROUTER_API_KEY` and server-side Supabase service credentials. Keep every provider key server-only: never prefix it with `VITE_`, expose it to the browser, or commit it. OpenRouter's free-model quotas are shared by the configured API account and can change; Supabase separately enforces the guest allowance.

## Authentication configuration

Google sign-in and email/password authentication are handled by Supabase Auth:

- The active schema migrations are in `supabase/migrations/`. This project has a legacy baseline and an existing migration ledger that must be reconciled before replaying migrations. **Do not run `supabase db push` blindly** against production; first compare the migration ledger and live schema using `docs/DB_MIGRATION_AUDIT.md`.
- The migrations grant the admin role to the account with the configured creator email, including accounts created after the migrations are applied. They do not create or set an account password; create/sign in to that account through Supabase Auth and keep its password private.
- In Supabase, enable Google under **Authentication → Providers → Google** and add the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the OAuth client in Google Cloud.
- Under **Authentication → URL Configuration**, set the site URL and allow the local app URL (`http://localhost:5173/**`) and your deployed app URL as redirects.
- To allow users to sign up without verifying their email, disable **Confirm email** under **Authentication → Providers → Email** in Supabase. With confirmation enabled, Supabase does not create an authenticated session after signup.

Guest ExpertAI uses OpenRouter (`OPENROUTER_API_KEY`); signed-in chat and the coding agent currently use Kilo Gateway. Supabase provider, redirect, and server environment settings must match the active project. See `docs/AI_PROVIDER_SETUP.md` for the required server-only variables and guest-chat verification steps.

## Production deployment to Vercel

The repository includes a GitHub Actions workflow at `.github/workflows/vercel-deploy.yml` that deploys the `main` branch to Vercel production on every push and can also be run manually.

Before the workflow can deploy, add these three values in **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

- `VERCEL_TOKEN`: create a token in your Vercel account settings.
- `VERCEL_ORG_ID`: the Vercel team/account ID for the project.
- `VERCEL_PROJECT_ID`: the project ID for this website.

Find the project and team IDs in Vercel under **Project → Settings → General** (the project ID) and the Vercel team/account settings (the team ID). Keep the token private; do not commit it to the repository.

After saving all three secrets, open **GitHub → Actions → Deploy to Vercel → Run workflow** and run it on `main`. The workflow pulls the production Vercel settings, builds the app, and deploys the prebuilt output to production. If any credential is missing, the workflow fails at its validation step and names the missing secret; it does not report a successful deployment.
