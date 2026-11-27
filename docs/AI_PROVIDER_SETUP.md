# ExpertAI provider configuration

API credentials must remain server-only. Never use `VITE_*` variables for provider API keys.

## Activate OpenAPIs for normal ExpertAI chat

1. Open the [ExpertsTeamWebsite Vercel project](https://vercel.com/chris-programs1/experts-team-website).
2. Go to **Settings → Environment Variables**.
3. Add these two variables for **Production** (also add them to Preview if testing a preview deployment):

   | Name | Value |
   |---|---|
   | `OPENAPIS_API_KEY` | Your OpenAPIs API key |
   | `OPENAPIS_MODEL` | `gpt-5.4-mini` |

4. Save the variables.
5. Open **Deployments**, find the latest deployment from `main`, and choose **Redeploy**. Existing deployments do not receive newly added variables automatically.
6. Wait for **Ready**, open the live site, and test the regular ExpertAI chat (not Agent Builder) with: `Which provider and model are powering this response?`

Normal ExpertAI chat is pinned directly to OpenAPIs in code. It sends a native OpenAI-compatible streaming request (`stream: true`). The server collects the upstream SSE response and adapts it to the existing chat response format.

## Kilo temporarily disabled for normal chat testing

Kilo fallback is intentionally disabled in the normal ExpertAI chat route. If OpenAPIs fails, the chat will show an OpenAPIs test error instead of silently returning a Kilo response. This makes the test conclusive.

Other AI callers, including Agent Builder, default to Kilo and are not switched by this normal-chat test setting.

To restore Kilo for normal chat after testing, change the normal-chat call in `src/routes/api.ai.stream.ts` from:

```ts
generateExpertAiContent(input, { provider: "openapis", fallbackToKilo: false })
```

to:

```ts
generateExpertAiContent(input, { provider: "kilo" })
```

Then commit and redeploy.

## API key warning

The value `admin` was a publicly documented shared beta credential in the OpenAPIs README when this integration was first tested. It is not a private production key. Use a personal/issued key if the service provides one. If the shared key is still the only available credential, use it only for a temporary test and assume anyone can use it.

OpenAPIs is a third-party beta proxy. Its exact quotas and ongoing free availability are not guaranteed. Avoid sending sensitive or confidential information through it.

## Scope and limitations

- This change applies to the normal ExpertAI chat endpoint.
- Agent Builder's coding-agent runtime and project execution remain separate and default to Kilo.
- The integration uses OpenAI-compatible chat completions; it does not activate OpenAPIs' Anthropic/Claude endpoint.
- OpenAPIs is streamed upstream, but the route collects the completed answer before emitting the app's existing SSE response to the browser.
- Provider credentials are read only on the server.
