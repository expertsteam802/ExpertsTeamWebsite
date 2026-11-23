import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pluginOAuthRedirect, verifyPluginOAuthState } from "@/lib/plugin-oauth.server";

export const Route = createFileRoute("/api/plugins/supabase/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) return Response.redirect(new URL("/connections?plugin_error=" + encodeURIComponent(providerError), url.origin));
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!code || !state) return Response.json({ error: "Supabase did not return an authorization code." }, { status: 400 });
    try {
      const signed = verifyPluginOAuthState(state, "supabase");
      const clientId = process.env["SUPABASE_OAUTH_CLIENT_ID"];
      const clientSecret = process.env["SUPABASE_OAUTH_CLIENT_SECRET"];
      if (!clientId || !clientSecret || !signed.codeVerifier) throw new Error("Supabase OAuth credentials or PKCE verifier are missing.");
      const tokenResponse = await fetch("https://api.supabase.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: pluginOAuthRedirect("supabase"), code_verifier: signed.codeVerifier }),
        signal: AbortSignal.timeout(15000),
      });
      const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; error?: string; message?: string };
      if (!tokenResponse.ok || !token.access_token) throw new Error(token.message || token.error || "Supabase OAuth token exchange failed.");
      const projectsResponse = await fetch("https://api.supabase.com/v1/projects", {
        headers: { Authorization: "Bearer " + token.access_token, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!projectsResponse.ok) throw new Error("Supabase authorized the account, but its project list could not be read.");
      const projects = await projectsResponse.json() as Array<{ id?: string; name?: string }>;
      const accountLabel = projects.length + " Supabase project" + (projects.length === 1 ? "" : "s");
      const { error } = await supabaseAdmin.rpc("store_plugin_oauth_connection", {
        p_user_id: signed.userId,
        p_provider: "supabase",
        p_display_name: "Supabase Management (" + accountLabel + ")",
        p_provider_account_id: "management-account",
        p_provider_username: null,
        p_scopes: ["projects.read", "management_api"],
        p_token_payload: {
          access_token: token.access_token,
          refresh_token: token.refresh_token ?? null,
          token_type: token.token_type ?? "bearer",
          expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
        },
      });
      if (error) throw new Error("Could not securely save the Supabase connection: " + error.message);
      return Response.redirect(new URL("/connections?plugin_connected=supabase", url.origin));
    } catch (error) {
      console.error("[Plugin OAuth] Supabase callback failed:", error);
      return Response.redirect(new URL("/connections?plugin_error=" + encodeURIComponent(error instanceof Error ? error.message : "Supabase connection failed"), url.origin));
    }
  } } },
});
