# ExpertAI provider configuration

Provider credentials must remain server-only. Never expose provider API keys through `VITE_*` variables.

## Current provider routing

- Normal ExpertAI chat uses the Kilo Gateway with the `kilo-auto/free` model.
- Agent Builder uses the same Kilo Gateway transport.
- Kilo's shared free endpoint is called without a user-supplied API key. Upstream model availability and rate limits still apply.
- OpenAPIs support remains in the server adapter for controlled testing, but it is not selected by normal chat.

No provider environment variables are required for the default Kilo route.

## Optional OpenAPIs testing

To test OpenAPIs deliberately, the server adapter supports:

| Name | Value |
|---|---|
| `OPENAPIS_API_KEY` | An issued OpenAPIs key |
| `OPENAPIS_MODEL` | `gpt-5.4-mini` (default) |

Add these as server-only Vercel environment variables and redeploy. Do not switch normal chat to OpenAPIs for production without confirming the upstream is healthy and reliable. A public shared credential such as `admin` is not suitable for production.

## Reliability notes

- Kilo may return rate-limit or upstream availability errors; the UI should report those honestly.
- Do not silently claim a provider succeeded when the request failed.
- Keep API keys out of browser bundles, project files, logs and client-visible responses.
- Agent Builder has a separate project workspace and execution runtime. It uses Kilo for model reasoning; project files are saved through the authenticated project storage flow and the browser terminal/preview run in the isolated WebContainer runtime.
