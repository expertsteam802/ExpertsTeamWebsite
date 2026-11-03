# Free-tier AI provider setup

ExpertsTeam sends AI requests through server-side routes. Provider keys must be stored in **Vercel → Project → Settings → Environment Variables**. Never put provider keys in a `VITE_*` variable, browser code, a committed `.env` file, or a chat message.

## Recommended free-first configuration

Set these variables in Vercel (Production, Preview, and Development as needed):

| Variable                | Suggested value                              | Required          |
| ----------------------- | -------------------------------------------- | ----------------- |
| `AI_PROVIDER_ORDER`     | `groq,gemini,openrouter`                    | Yes               |
| `GEMINI_API_KEY`        | Your Google AI Studio key                    | Optional fallback |
| `GEMINI_CODE_MODEL`     | `gemini-3.8-flash`                           | Optional          |
| `GEMINI_MODEL`          | `gemini-3.8-flash`                           | Optional          |
| `GEMINI_CHAT_MODEL`     | `gemini-3.8-flash`                           | Optional          |
| `GROQ_API_KEY`          | Your Groq key                                | Optional fallback |
| `GROQ_MODEL`            | `openai/gpt-oss-120b`                        | Optional          |
| `OPENROUTER_API_KEY`    | Your OpenRouter key                          | Optional fallback |
| `OPENROUTER_MODEL`      | `openrouter/free`                            | Optional          |

At least one provider must be configured. Configure two or more providers for meaningful failover. The router tries Groq, Gemini, then OpenRouter by default (or the providers in `AI_PROVIDER_ORDER` if you override it); missing provider keys are skipped. It moves to the next provider after a failed request and temporarily cools down providers after rate limits, authentication failures, unavailable models, or outages. Provider quotas are account-specific and can change, so free access is never guaranteed to be unlimited.

## Get keys

- Google AI Studio: https://aistudio.google.com/api-keys
- Groq: https://console.groq.com/keys
- OpenRouter: https://openrouter.ai/settings/keys

## Free-tier notes

- Gemini API has a free tier for eligible models/projects. Review its current model availability, rate limits, and data-use terms before using it with private customer information.
- Groq publishes per-model free-plan limits. The default model above is fast, but free-tier TPM limits can be tight. ExpertsTeam now trims conversation history and caps completion tokens to reduce 413 token-limit errors.
- OpenRouter's `openrouter/free` is a dynamic free-model route. The available underlying model can change and request/day limits apply.

## After adding keys

1. Add the variables in Vercel without the `VITE_` prefix.
2. Redeploy the project so the server receives the new environment.
3. Test Expert AI chat and Studio generation separately.
4. If all providers are out of quota, wait for quota reset or add another eligible provider key. Do not keep retrying rapidly.

## Important security and cost behavior

- Keys are only read by server-side code and must never be returned to the browser.
- Do not enable automatic paid billing unless you deliberately choose to.
- Administrators bypass credit limits. The $1 subscription must have a configurable AI allowance. It cannot promise unlimited AI usage while relying on third-party free quotas.
