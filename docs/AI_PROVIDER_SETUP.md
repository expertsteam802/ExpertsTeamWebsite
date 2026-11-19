# ExpertAI — Kilo Gateway only

ExpertAI chat and the coding agent use the Kilo AI Gateway as their sole model provider. Gemini, Groq, and OpenRouter are not configured as fallback providers. The application is designed to keep working within the changing limits of anonymous free models; it cannot make upstream model limits disappear.

## Default free configuration

No API key is required for Kilo's anonymous free models.

| Variable | Value | Required |
| --- | --- | --- |
| `KILO_API_BASE_URL` | `https://ai-gateway.kilo.ai/api/v1` | No (default is used) |
| `KILO_MODEL` | `kilo-auto/free` | No (default is used) |
| `KILO_API_KEY` | Your Kilo Gateway key, if using authenticated/paid Kilo access | No |

Do not add Kilo keys to `VITE_*` variables or browser code. If a key is configured, the backend sends it server-side. Without a key, the backend uses Kilo's anonymous free-model access.

## Anonymous free limits and IP behavior

Kilo documents a limit of **200 free-model requests per hour per IP address**. Kilo's free-model availability and upstream provider limits can change.

Important: the current ExpertsTeam implementation calls Kilo from the server. On serverless hosting, Kilo may see a shared hosting egress IP rather than each visitor's IP. Therefore, visitors may share the gateway's IP-based allowance. Do not advertise 200 requests per visitor.

We must not spoof forwarded-IP headers to bypass Kilo's rate limits. A future direct-browser integration would require confirming Kilo's browser CORS support and designing safe user/session credit enforcement first.

## Model and attachment behavior

- `kilo-auto/free` dynamically selects from currently available free models.
- ExpertAI requests up to 8,192 output tokens where the selected model supports it. If a model rejects the request because of context/output capacity, the adapter retries with smaller context and output budgets; unsupported JSON response mode is retried without that optional API parameter.
- The coding agent uses resumable file batches and stops immediately on a quota/authentication error instead of repeatedly hitting the same exhausted quota.
- Image attachments are forwarded in the OpenAI-compatible image format. Actual vision support still depends on the free model selected for that request.
- Not every free model supports images or every file modality. Image requests are sent using OpenAI-compatible image content; a selected model without vision support may reject them.
- Text attachments are extracted/compacted by ExpertsTeam before being sent to Kilo.
- Kilo Auto Free may route prompts and outputs to upstream providers that log or use data to improve their services. Users should not submit confidential or sensitive information through the free tier.

## Removed providers

The application no longer routes to Gemini, Groq, or OpenRouter. Old environment variables for those providers are not used by ExpertAI and can be removed from Vercel after the Kilo-only deployment is verified.

## Deployment checks

1. Deploy the `main` branch.
2. Confirm ExpertAI chat works without `KILO_API_KEY`.
3. Test signed-in and guest chat separately.
4. Test the coding agent separately.
5. Verify rate-limit errors are presented clearly.
6. Test image attachments with the live free model; image capability depends on the model selected by Kilo.
7. Check Vercel logs for Kilo Gateway errors without logging prompts, files, or credentials.
8. Test a short chat, a long answer, a multi-file coding task, and an image attachment. Confirm that a capacity error retries once with smaller limits and that a 429 stops without repeated requests.

Official documentation:
- https://kilo.ai/docs/gateway/authentication
- https://kilo.ai/docs/gateway/usage-and-billing
- https://kilo.ai/docs/gateway/models-and-providers
