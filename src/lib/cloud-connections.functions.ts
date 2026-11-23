import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const connectionInput = z.object({
  displayName: z.string().trim().max(80).default(""),
  projectUrl: z.string().trim().url().max(300),
  publishableKey: z.string().trim().min(20).max(1000),
  secretKey: z.string().trim().max(2000).optional().default(""),
});

function legacyJwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

function parseSupabaseProjectUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("Use the HTTPS Project URL shown in your Supabase dashboard.");
  }
  const match = url.hostname.match(/^([a-z0-9-]{3,64})\.supabase\.co$/i);
  if (!match) {
    throw new Error("For now, connect a standard *.supabase.co project URL. Custom domains are not supported yet.");
  }
  return { url: url.origin, projectRef: match[1] };
}

export const connectSupabaseProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => connectionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { url, projectRef } = parseSupabaseProjectUrl(data.projectUrl);
    const key = data.publishableKey;
    if (!(key.startsWith("sb_publishable_") || legacyJwtRole(key) === "anon")) {
      throw new Error("Enter a Supabase publishable key or legacy anon key. Do not use a secret/service_role key here.");
    }
    if (data.secretKey && !(data.secretKey.startsWith("sb_secret_") || legacyJwtRole(data.secretKey) === "service_role")) {
      throw new Error("The server key must be a Supabase secret key or legacy service_role key.");
    }

    const response = await fetch(url + "/auth/v1/settings", {
      method: "GET",
      headers: { apikey: key },
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);
    if (!response?.ok) {
      throw new Error("Supabase connection test failed. Check the Project URL and publishable/anon key.");
    }

    const { data: saved, error } = await context.supabase.rpc("save_user_supabase_connection", {
      p_display_name: data.displayName || projectRef,
      p_project_url: url,
      p_project_ref: projectRef,
      p_publishable_key: key,
      p_secret_key: data.secretKey || null,
    });
    if (error) throw new Error("The connection was tested but could not be saved securely: " + error.message);
    return saved;
  });

export const disconnectSupabaseProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: removed, error } = await context.supabase.rpc("delete_user_supabase_connection", {
      p_connection_id: data.connectionId,
    });
    if (error) throw new Error(error.message);
    if (!removed) throw new Error("Connection not found or it no longer belongs to your account.");
    return { ok: true };
  });
