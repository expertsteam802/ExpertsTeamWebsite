# ExpertAI Kilo Gateway configuration

ExpertsTeam Agent Studio uses **Kilo Gateway as its sole AI provider** for signed-in chat, guest chat, Plan, Build, image-reference understanding, and streaming responses.

## Free gateway configuration

- Endpoint: `https://ai-gateway.kilo.ai/api/v1/chat/completions`
- Model: `kilo-auto/free` (Kilo's automatic free-model tier)
- Authentication: no API key or Authorization header is required for free models.
- Rate limit: 200 free-model requests per hour per IP address.

The previous `openai/gpt-oss-120b` default was not a free model. It requires authenticated access and can return HTTP 401 when called anonymously. ExpertsTeam now defaults to `kilo-auto/free` so it uses Kilo's anonymous free tier.

Do not set a paid model override if the deployment is intended to remain keyless. Kilo's free model availability and upstream provider limits may change. HTTP 429 means the per-IP hourly free request limit or an upstream limit has been reached.

No Gemini API, Groq API, OpenRouter API, or alternate-provider fallback is integrated. If Kilo's free tier is unavailable, the request returns a clear error rather than silently switching providers.

Official references:
- https://kilo.ai/docs/gateway/authentication
- https://kilo.ai/docs/gateway/usage-and-billing
- https://kilo.ai/docs/getting-started/using-kilo-for-free
