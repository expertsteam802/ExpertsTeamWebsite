# ExpertAI Kilo Gateway configuration

ExpertsTeam Agent Studio uses **Kilo Gateway as its sole AI provider** for signed-in chat, guest chat, Plan, Build, image-reference understanding, and streaming responses.

## Gateway

- Endpoint: `https://ai-gateway.kilo.ai/api/v1/chat/completions`
- Default model: `openai/gpt-oss-120b`
- Optional server-only model override: `KILO_GATEWAY_MODEL`
- Authentication: required. Set the server-only `KILO_API_KEY` environment variable to your Kilo Gateway API key. Requests send `Authorization: Bearer <KILO_API_KEY>`.

No Gemini API, Groq API, OpenRouter API, or alternate-provider fallback is integrated. If Kilo Gateway is unavailable or rate-limited, the request returns a clear error rather than silently switching providers.

## Required deployment setup

1. Open your Kilo account at `https://app.kilo.ai`.
2. Open your personal profile (not the organization profile), scroll to the bottom, and copy your Kilo API key.
3. In the ExpertsTeam hosting environment settings, add `KILO_API_KEY` with that value for **Production** (and Preview/Development if you use those environments).
4. Redeploy the application so the server runtime receives the variable.
5. Keep the key server-side only. Do not use a `VITE_` prefix, expose it to browser code, or commit it to Git.

A missing key is now reported as a configuration error. An HTTP 401 means the configured key is missing, invalid, expired, or otherwise not accepted by Kilo; replace it with a fresh key from your Kilo profile.

Guest usage limits are enforced separately through Supabase server-side credentials and RPCs.
