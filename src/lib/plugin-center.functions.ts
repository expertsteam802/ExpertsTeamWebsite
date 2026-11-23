import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROVIDER_ACTIONS: Record<string, string[]> = {
  github: ["repositories.read", "files.read", "files.write", "branches.create", "commits.create", "pull_requests.read", "pull_requests.create", "issues.read", "issues.create", "repositories.delete", "webhooks.manage"],
  supabase: ["organizations.read", "projects.read", "schemas.read", "sql.read", "sql.write", "tables.create", "tables.alter", "tables.drop", "auth.read", "auth.manage", "storage.read", "storage.write", "functions.deploy", "projects.delete"],
  vercel: ["projects.read", "deployments.read", "deployments.create", "domains.manage", "environment.read", "environment.write", "projects.delete"],
  netlify: ["sites.read", "deploys.read", "deploys.create", "environment.read", "environment.write", "sites.delete"],
  stripe: ["products.read", "customers.read", "payments.read", "webhooks.read"],
  figma: ["files.read", "comments.read", "comments.write"],
  google_drive: ["files.read", "files.create", "files.update", "files.delete"],
};

const DESTRUCTIVE_ACTIONS = new Set([
  "repositories.delete", "tables.drop", "projects.delete", "sites.delete",
  "environment.write", "domains.manage", "auth.manage", "webhooks.manage",
]);

export const getPluginCenterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const [connections, permissions, audit] = await Promise.all([
      db.from("user_plugin_connections")
        .select("id,provider,display_name,provider_username,scopes,status,connected_at,last_used_at")
        .eq("user_id", context.userId).order("connected_at", { ascending: false }),
      db.from("user_plugin_permissions")
        .select("id,connection_id,project_id,actions,require_approval_for,updated_at")
        .eq("user_id", context.userId),
      db.from("plugin_audit_logs")
        .select("id,connection_id,provider,action,resource,success,created_at")
        .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(30),
    ]);
    for (const result of [connections, permissions, audit]) {
      if (result.error) throw new Error("Could not load plugin center: " + result.error.message);
    }
    return {
      connections: connections.data ?? [],
      permissions: permissions.data ?? [],
      audit: audit.data ?? [],
      catalog: Object.entries(PROVIDER_ACTIONS).map(([provider, actions]) => ({ provider, actions })),
    };
  });

export const updatePluginPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    connectionId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    actions: z.array(z.string()).max(40),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: connection, error: connectionError } = await db.from("user_plugin_connections")
      .select("id,provider").eq("id", data.connectionId).eq("user_id", context.userId).maybeSingle();
    if (connectionError) throw new Error(connectionError.message);
    if (!connection) throw new Error("Plugin connection not found or access has been revoked.");
    const allowed = PROVIDER_ACTIONS[connection.provider] ?? [];
    const invalid = data.actions.filter((action) => !allowed.includes(action));
    if (invalid.length) throw new Error("Unsupported permission requested: " + invalid.join(", "));
    const requireApproval = data.actions.filter((action) => DESTRUCTIVE_ACTIONS.has(action));
    const { error } = await db.from("user_plugin_permissions").upsert({
      user_id: context.userId,
      connection_id: data.connectionId,
      project_id: data.projectId ?? null,
      actions: data.actions,
      require_approval_for: requireApproval,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,connection_id,project_id" });
    if (error) throw new Error("Could not save plugin permissions: " + error.message);
    return { ok: true, actions: data.actions, requireApproval };
  });

export const revokePluginConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: connection, error: lookupError } = await db.from("user_plugin_connections")
      .select("id,provider").eq("id", data.connectionId).eq("user_id", context.userId).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!connection) throw new Error("Plugin connection not found.");
    const { error } = await db.from("user_plugin_connections")
      .delete().eq("id", data.connectionId).eq("user_id", context.userId);
    if (error) throw new Error("Could not revoke plugin: " + error.message);
    return { ok: true };
  });
