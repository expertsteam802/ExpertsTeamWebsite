# ExpertAI provider configuration

ExpertsTeam normal AI chat uses a server-side provider adapter. Provider credentials must remain server-only: never use `VITE_*` environment variables for API keys.

## Activate OpenAPIs for normal chat

In Vercel:

1. Open the **ExpertsTeamWebsite** project.
2. Go to **Settings → Environment Variables**.
3. Add the following variables. Select **Production** (and Preview too if you want to test preview deployments).

   | Name | Value |
   |---|---|
   | `OPENAPIS_API_KEY` | Your OpenAPIs API key |
   | `OPENAPIS_MODEL` | `gpt-5.4-mini` |

4. Save the variables.
5. Go to **Deployments**, open the latest deployment for the `main` branch, and choose **Redeploy**. A deployment created before adding the variables will not automatically receive them.
6. Wait until the deployment is **Ready**, open the live website, and test the regular ExpertAI chat (not Agent Builder) with: `Reply with the provider name and model configured for this request.`

The normal ExpertAI chat route is pinned directly to OpenAPIs for this test. It sends a native OpenAI-compatible streaming request (`stream: true`) and adapts the streamed tokens to the existing ExpertsTeam chat response format. **Kilo fallback is intentionally disabled for normal chat**, so a failed OpenAPIs request will fail visibly rather than being served by Kilo. Other callers of the shared transport, including Agent Builder, default to Kilo unless they explicitly select another provider.

### API key warning

The value `admin` was a publicly documented shared beta credential in the OpenAPIs README when this integration was first tested. It is not a private production key. Use a personal/issued key if the service provides one. If the only available credential is still the public shared key, use it only for a temporary test and assume anyone can use it.

OpenAPIs is a third-party beta proxy. Its exact quotas and ongoing free availability are not guaranteed. Avoid sending sensitive or confidential information through it.

## Automatic fallback

When OpenAPIs is selected, ExpertsTeam automatically retries the request through Kilo Gateway if OpenAPIs has a transient network failure, timeout, HTTP 429, HTTP 5xx, or empty streaming response.

A rejected API key (HTTP 401/403), invalid model, or other non-transient request error is not silently hidden; inspect the server logs and correct the configuration.

Kilo fallback uses:
- Endpoint: `https://ai-gateway.kilo.ai/api/v1/chat/completions`
- Model: `kilo-auto/free`

Fallback is automatic; no additional environment variable is required.

## Rollback to Kilo only

To disable OpenAPIs, change:

- `EXPERTS_AI_PROVIDER=kilo`

Then redeploy. You can also remove the OpenAPIs key/model variables after switching back. No database migration is required.

## Scope and limitations

- This provider selection affects the shared server-side text-generation transport used by normal ExpertAI chat and other code paths that call `generateExpertAiContent`.
- Agent Builder's CLI/runtime and project execution are not replaced by this chat API integration.
- The integration uses OpenAI-compatible chat completions. It does not activate OpenAPIs' Anthropic/Claude endpoint.
- The normal-chat route collects the OpenAPIs response before emitting the app SSE response. OpenAPIs is streamed upstream, but each upstream token is not forwarded to the browser immediately.
- Provider credentials are read only on the server.
