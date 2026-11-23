# ExpertAI provider configuration

## Guest chat — OpenRouter

Guest ExpertAI requests are sent from the server to OpenRouter. Visitors do not need a Supabase account or an OpenRouter key. Supabase still enforces the server-side guest allowance (15 prompts per IP/session hash per rolling 24-hour window).

Set these variables in Vercel for **Production, Preview, and Development** as needed:

| Variable | Value | Required |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Secret from https://openrouter.ai/settings/keys | Yes for guest AI |
| `OPENROUTER_MODEL` | `openrouter/free` | No |

Keep `OPENROUTER_API_KEY` server-only. Never prefix it with `VITE_`, expose it in browser code, or commit it to Git.

OpenRouter's free-model router selects an available free model. Free model availability and provider quotas can change. OpenRouter currently documents a 20 requests/minute limit and 50 requests/day for free variants on an unfunded account; failed attempts may count toward the limit. Check current limits before advertising guest availability.

## Signed-in chat and coding agent

Signed-in ExpertAI and the coding agent currently use the Kilo Gateway adapter:

| Variable | Value | Required |
| --- | --- | --- |
| `KILO_API_BASE_URL` | `https://ai-gateway.kilo.ai/api/v1` | No |
| `KILO_MODEL` | `kilo-auto/free` | No |
| `KILO_API_KEY` | Kilo Gateway key | No for anonymous free access |

The Kilo adapter is separate from the Builder's interactive Kilo CLI terminal.

## Supabase server configuration

Guest requests require the following server-only variables in Vercel:

- `SUPABASE_URL` (or the existing `VITE_SUPABASE_URL` fallback)
- `SUPABASE_PUBLISHABLE_KEY` (or the existing `VITE_SUPABASE_PUBLISHABLE_KEY` fallback)
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

Never expose a Supabase secret/service-role key through a `VITE_*` variable. The secret key is used only by the server to check and consume guest credits in the private schema.

## Verification after deployment

1. Deploy the `main` branch.
2. Open a private/incognito browser window and send a text-only guest message without signing in.
3. Confirm the response streams and the guest counter decreases.
4. Send another message and confirm the server-side counter changes in Supabase.
5. Exhaust the allowance in a test environment and confirm the API returns HTTP 402.
6. Confirm an invalid/missing guest session returns HTTP 400.
7. Confirm a missing OpenRouter key returns a clear HTTP 503 rather than a generic error.
8. Sign in and verify signed-in chat still uses Kilo and decrements the authenticated user's AI credits.
9. Check Vercel logs for provider status codes; never log API keys, prompts, or uploaded content.

Official references:
- https://openrouter.ai/openrouter/free
- https://openrouter.ai/collections/free-models/
- https://supabase.com/docs/guides/database/postgres/row-level-security
