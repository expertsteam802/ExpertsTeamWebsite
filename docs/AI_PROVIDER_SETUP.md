# ExpertAI provider configuration

ExpertsTeam normal AI chat and server-side AI generation share one provider transport. Select the provider with server-only environment variables; never expose provider credentials through `VITE_*` variables or browser code.

## OpenAPIs (temporary beta test)

Set these variables in the deployment environment (for example, Vercel → Project Settings → Environment Variables):

- `EXPERTS_AI_PROVIDER=openapis`
- `OPENAPIS_API_KEY=admin` (the shared beta credential currently documented by OpenAPIs; treat it as temporary and do not commit it)
- `OPENAPIS_MODEL=gpt-5.4-mini` (change to another model listed by OpenAPIs if needed)

The server calls:

- `https://api.openapis.online/openai/v1/chat/completions`

The API key is added to the Authorization header on the server only. Normal chat keeps its existing ExpertsTeam streaming response contract; the provider response is translated into the format already consumed by the chat UI.

OpenAPIs is a third-party hosted proxy. Its README describes free access during open beta, but the service is proprietary and its availability, model access, and terms may change. Do not send sensitive/private data through this beta service.

## Existing Kilo provider

To keep using the current provider, set:

- `EXPERTS_AI_PROVIDER=kilo` (or omit the variable)

Kilo endpoint: `https://ai-gateway.kilo.ai/api/v1/chat/completions`

Model: `kilo-auto/free`

No Kilo API key is required for its documented anonymous free tier.

## Rollback

Set `EXPERTS_AI_PROVIDER=kilo` and redeploy. No database migration is required.

## Important

- Provider selection and API keys are server-side only.
- The OpenAPIs beta key is shared and publicly documented; it is suitable only for a temporary test, not a production secret.
- The current OpenAPIs integration uses the OpenAI-compatible chat-completions endpoint. It does not yet enable Claude/Anthropic models or CLI agent execution.
- This provider switch affects the shared generation transport used by normal chat and other server-side AI generation paths; it does not create a real CLI coding-agent runtime.
