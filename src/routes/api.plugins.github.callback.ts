import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pluginOAuthRedirect, verifyPluginOAuthState } from "@/lib/plugin-oauth.server";

function githubOAuthPopupResponse(
  url: URL,
  result: { success: boolean; error?: string },
  fallbackPath: string,
): Response {
  const payload = JSON.stringify({ type: "experts-plugin-oauth", provider: "github", ...result }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(url.origin);
  const fallback = JSON.stringify(fallbackPath);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitHub connection</title></head><body><p>Finishing GitHub connection…</p><script>(function(){var result=${payload};if(window.opener&&!window.opener.closed){window.opener.postMessage(result,${origin});window.close();}else{window.location.replace(${fallback});}})();</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'",
    },
  });
}

export const Route = createFileRoute("/api/plugins/github/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) return githubOAuthPopupResponse(url, { success: false, error: providerError }, "/connections?plugin_error=" + encodeURIComponent(providerError));
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!code || !state) return githubOAuthPopupResponse(url, { success: false, error: "GitHub did not return an authorization code." }, "/connections?plugin_error=missing_code");
    try {
      const signed = verifyPluginOAuthState(state, "github");
      const clientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
      const clientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"];
      if (!clientId || !clientSecret) throw new Error("GitHub OAuth is not configured.");
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: pluginOAuthRedirect("github"), state }),
        signal: AbortSignal.timeout(15000),
      });
      const token = await tokenResponse.json() as { access_token?: string; scope?: string; error?: string; error_description?: string };
      if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.error || "GitHub token exchange failed.");
      const userResponse = await fetch("https://api.github.com/user", {
        headers: { Authorization: "Bearer " + token.access_token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ExpertsTeam-Plugin-Center" },
        signal: AbortSignal.timeout(15000),
      });
      if (!userResponse.ok) throw new Error("Could not verify the authorized GitHub account.");
      const user = await userResponse.json() as { id?: number; login?: string; name?: string };
      if (!user.id || !user.login) throw new Error("GitHub returned an incomplete account profile.");
      const { error } = await supabaseAdmin.rpc("store_plugin_oauth_connection", {
        p_user_id: signed.userId,
        p_provider: "github",
        p_display_name: user.name || user.login,
        p_provider_account_id: String(user.id),
        p_provider_username: user.login,
        p_scopes: (token.scope || "").split(/[ ,]+/).filter(Boolean),
        p_token_payload: { access_token: token.access_token, token_type: "bearer" },
      });
      if (error) throw new Error("Could not securely save the GitHub connection: " + error.message);
      return githubOAuthPopupResponse(url, { success: true }, "/connections?plugin_connected=github");
    } catch (error) {
      console.error("[Plugin OAuth] GitHub callback failed:", error);
      const message = error instanceof Error ? error.message : "GitHub connection failed";
      return githubOAuthPopupResponse(url, { success: false, error: message }, "/connections?plugin_error=" + encodeURIComponent(message));
    }
  } } },
});
