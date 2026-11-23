import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const beginGitHubPluginOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const clientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
    if (!clientId) throw new Error("GitHub plugin is not configured yet. Add GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET to the production server environment.");
    if (!process.env["GITHUB_OAUTH_CLIENT_SECRET"]) throw new Error("GitHub OAuth client secret is missing.");
    const { createPluginOAuthState, pluginOAuthRedirect } = await import("@/lib/plugin-oauth.server");
    const state = createPluginOAuthState("github", context.userId);
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", pluginOAuthRedirect("github"));
    url.searchParams.set("scope", "repo delete_repo read:user user:email");
    url.searchParams.set("state", state);
    return { url: url.toString() };
  });

export const beginSupabasePluginOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ organizationSlug: z.string().trim().max(100).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const clientId = process.env["SUPABASE_OAUTH_CLIENT_ID"];
    if (!clientId) throw new Error("Supabase Management OAuth is not configured yet. Register the ExpertsTeam integration in Supabase and add SUPABASE_OAUTH_CLIENT_ID and SUPABASE_OAUTH_CLIENT_SECRET.");
    if (!process.env["SUPABASE_OAUTH_CLIENT_SECRET"]) throw new Error("Supabase OAuth client secret is missing.");
    const { createPluginOAuthState, pluginOAuthRedirect, supabaseOAuthChallenge } = await import("@/lib/plugin-oauth.server");
    const verifier = randomBytes(48).toString("base64url");
    const state = createPluginOAuthState("supabase", context.userId, verifier);
    const url = new URL("https://api.supabase.com/v1/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", pluginOAuthRedirect("supabase"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", supabaseOAuthChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    if (data.organizationSlug) url.searchParams.set("organization_slug", data.organizationSlug);
    return { url: url.toString() };
  });
