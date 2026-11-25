# ExpertAI Kilo Gateway configuration

ExpertsTeam Agent Studio uses **Kilo Gateway as its sole AI provider** for signed-in chat, guest chat, Plan, Build, image-reference understanding, and streaming responses.

## Gateway

- Endpoint: `https://ai-gateway.kilo.ai/api/v1/chat/completions`
- Default model: `openai/gpt-oss-120b`
- Optional server-only model override: `KILO_GATEWAY_MODEL`
- Authentication: the current Kilo anonymous gateway route does not send a provider API key.

No Gemini API, Groq API, OpenRouter API, or alternate-provider fallback is integrated. If Kilo Gateway is unavailable or rate-limited, the request returns a clear error rather than silently switching providers.

Keep any future Kilo credentials server-side only. Never expose secrets through `VITE_` variables or commit them to the repository.

Guest usage limits are enforced separately through Supabase server-side credentials and RPCs.
