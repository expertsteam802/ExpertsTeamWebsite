# ExpertAI provider configuration

## Guest chat — Groq primary, OpenRouter fallback

Guest ExpertAI requests are sent from the server. The adapter tries Groq first and falls back to OpenRouter if Groq is unavailable, rate-limited or returns an upstream error. Visitors never need provider API keys or accounts.

Set these variables in Vercel for **Production** (and Preview/Development if you test those environments):

| Variable | Value | Required |
| --- | --- | --- |
| `GROQ_API_KEY` | Server-side Groq API key | Recommended primary route |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | No |
| `OPENROUTER_API_KEY` | Server-side OpenRouter API key | Recommended fallback |
| `OPENROUTER_MODEL` | `openrouter/free` | No |

At least one provider key is required. For resilience, configure both. The default models are selected in server code; model availability, rate limits and free quotas can change. Do not promise uninterrupted or unlimited guest access based on free-tier availability.

Keep every provider key server-only. Never prefix a key with `VITE_`, expose it to browser code, or commit it to Git.

## Signed-in chat and coding agent

Signed-in chat and the coding agent use the server-side provider route configured by the application. Keep its gateway credentials server-only as well. The interactive terminal/CLI used inside the builder is a separate runtime from chat completion routing.

## Supabase server configuration

Guest requests require these server-side variables in Vercel:

- `SUPABASE_URL` (or the existing `VITE_SUPABASE_URL` fallback)
- `SUPABASE_PUBLISHABLE_KEY` (or the existing `VITE_SUPABASE_PUBLISHABLE_KEY` fallback)
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

Never expose a Supabase secret/service-role key through a `VITE_*` variable. The secret key is used only by the server to check and consume guest credits.

Guest chat currently has a 15-message allowance per rolling 24-hour period. Authenticated users follow their separate account entitlement and credit logic.

## Verification after deployment

1. Confirm at least one guest provider key is configured; both are recommended.
2. Open a private/incognito browser window and send a text-only guest message without signing in.
3. Confirm the response streams and the guest allowance is consumed only for a completed/accepted request.
4. If both keys are configured, temporarily test with an invalid primary key in Preview and confirm the fallback route responds.
5. Confirm an invalid/missing guest session is rejected.
6. Test the 15-message guest limit in a safe test environment.
7. Sign in and verify authenticated chat and the coding agent independently.
8. Check server logs for provider status codes; never log API keys, prompts or uploaded content.

