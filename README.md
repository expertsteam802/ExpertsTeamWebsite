Authenticated AI requests run through server functions so the Gemini API key is not sent to the browser. Set `GEMINI_API_KEY=your-key` in the server environment and restart the server. `VITE_GEMINI_API_KEY` is supported for local development only; rotate any key previously exposed in a deployed client bundle.

## Authentication configuration

Google sign-in and email/password authentication are handled by Supabase Auth:

- The project is linked through `supabase/config.toml`. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), log in to the account that owns the project with `supabase login`, then run `supabase db push` from the project root. This applies the ordered migrations that create the app tables, access policies, and upload bucket. Verify you are targeting the intended project before pushing migrations.
- The migrations grant the admin role to the account with the configured creator email, including accounts created after the migrations are applied. They do not create or set an account password; create/sign in to that account through Supabase Auth and keep its password private.
- In Supabase, enable Google under **Authentication → Providers → Google** and add the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the OAuth client in Google Cloud.
- Under **Authentication → URL Configuration**, set the site URL and allow the local app URL (`http://localhost:5173/**`) and your deployed app URL as redirects.
- To allow users to sign up without verifying their email, disable **Confirm email** under **Authentication → Providers → Email** in Supabase. With confirmation enabled, Supabase does not create an authenticated session after signup.

The Gemini API key is used by authenticated server functions. Set `GEMINI_API_KEY` in the server environment; `VITE_GEMINI_API_KEY` remains supported for local development. Supabase provider, redirect, and server environment settings must also match the active project.

## Production deployment to Vercel

The repository includes a GitHub Actions workflow at `.github/workflows/vercel-deploy.yml` that deploys the `main` branch to Vercel production on every push and can also be run manually.

Before the workflow can deploy, add these three values in **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

- `VERCEL_TOKEN`: create a token in your Vercel account settings.
- `VERCEL_ORG_ID`: the Vercel team/account ID for the project.
- `VERCEL_PROJECT_ID`: the project ID for this website.

Find the project and team IDs in Vercel under **Project → Settings → General** (the project ID) and the Vercel team/account settings (the team ID). Keep the token private; do not commit it to the repository.

After saving all three secrets, open **GitHub → Actions → Deploy to Vercel → Run workflow** and run it on `main`. The workflow pulls the production Vercel settings, builds the app, and deploys the prebuilt output to production. If credentials are missing, the workflow reports that deployment was skipped rather than pretending a deployment succeeded.
