/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROVIDER_ACTIONS: Record<string, string[]> = {
  github: ["repositories.read", "files.read", "files.write", "branches.create", "pull_requests.read", "pull_requests.create", "issues.read", "issues.create", "repositories.delete"],
  supabase: ["organizations.read", "projects.read", "schemas.read", "sql.read", "sql.write", "tables.create", "tables.alter", "tables.drop", "projects.delete"],
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: removed, error } = await supabaseAdmin.rpc("delete_user_plugin_connection", {
      p_connection_id: data.connectionId,
      p_user_id: context.userId,
    });
    if (error) throw new Error("Could not revoke plugin: " + error.message);
    if (!removed) throw new Error("Plugin connection could not be revoked.");
    return { ok: true };
  });

const pluginActionInput = z.object({
  connectionId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  action: z.string().min(3).max(80),
  payload: z.record(z.string(), z.unknown()).default({}),
  approved: z.boolean().optional().default(false),
});

function readString(payload: Record<string, unknown>, key: string, max = 4000): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid or missing action field: " + key);
  return value.trim();
}

async function checkedJson(url: string, token: string, init: RequestInit = {}, github = false): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", github ? "application/vnd.github+json" : "application/json");
  if (github) {
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    headers.set("User-Agent", "ExpertsTeam-Plugin-Center");
  }
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(25000) });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 1000) }; }
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Provider request failed.";
    throw new Error("Provider API " + response.status + ": " + message);
  }
  return body;
}

export const executePluginAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => pluginActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: connection, error: connectionError } = await db.from("user_plugin_connections")
      .select("id,provider,display_name,status").eq("id", data.connectionId).eq("user_id", context.userId).maybeSingle();
    if (connectionError) throw new Error(connectionError.message);
    if (!connection || connection.status !== "connected") throw new Error("Plugin is disconnected or needs reauthorization.");

    const { data: permissionRows, error: permissionError } = await db.from("user_plugin_permissions")
      .select("actions,require_approval_for,project_id").eq("connection_id", data.connectionId).eq("user_id", context.userId);
    if (permissionError) throw new Error(permissionError.message);
    if (data.projectId) {
      const { data: project, error: projectError } = await db.from("agent_projects")
        .select("id").eq("id", data.projectId).eq("user_id", context.userId).maybeSingle();
      if (projectError) throw new Error("Could not verify the selected project permission scope.");
      if (!project) throw new Error("The selected project is unavailable.");
    }
    const permission = data.projectId
      ? (permissionRows ?? []).find((row: any) => row.project_id === data.projectId)
        ?? (permissionRows ?? []).find((row: any) => row.project_id === null)
      : (permissionRows ?? []).find((row: any) => row.project_id === null);
    if (!permission?.actions?.includes(data.action)) throw new Error("This Agent action is not permitted for the selected project. Enable it in Plugin Center first.");
    const alwaysConfirm = new Set(["repositories.delete", "tables.drop", "projects.delete", "auth.manage"]);
    if ((alwaysConfirm.has(data.action) || permission.require_approval_for?.includes(data.action)) && !data.approved) {
      throw new Error("This action requires explicit user approval before it can run.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: secret, error: secretError } = await supabaseAdmin.rpc("get_user_plugin_connection_secret", {
      p_connection_id: data.connectionId, p_user_id: context.userId,
    });
    if (secretError || !secret?.token_payload) throw new Error("The plugin credential is unavailable. Reconnect the account.");
    const tokenPayload = secret.token_payload as Record<string, unknown>;
    let token = typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : "";
    if (!token) throw new Error("The plugin access token is missing.");

    let result: unknown;
    let resource: string | null = null;
    const payload = data.payload as Record<string, unknown>;

    if (connection.provider === "github") {
      const base = "https://api.github.com";
      if (data.action === "repositories.read") {
        result = await checkedJson(base + "/user/repos?per_page=100&sort=updated", token, {}, true);
      } else if (data.action === "files.read") {
        const owner = readString(payload, "owner", 100);
        const repo = readString(payload, "repo", 100);
        const path = readString(payload, "path", 1000).split("/").map(encodeURIComponent).join("/");
        const branch = typeof payload.branch === "string" ? "?ref=" + encodeURIComponent(payload.branch) : "";
        const file = await checkedJson(base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + path + branch, token, {}, true);
        if (file.type !== "file" || typeof file.content !== "string") throw new Error("The selected GitHub path is not a file.");
        result = { path: file.path, sha: file.sha, content: Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8"), encoding: "utf-8" };
        resource = owner + "/" + repo + "/" + path;
      } else if (data.action === "files.write") {
        const owner = readString(payload, "owner", 100);
        const repo = readString(payload, "repo", 100);
        const path = readString(payload, "path", 1000).split("/").map(encodeURIComponent).join("/");
        const content = readString(payload, "content", 800000);
        const message = readString(payload, "message", 200);
        const branch = typeof payload.branch === "string" ? payload.branch : undefined;
        const sha = typeof payload.sha === "string" ? payload.sha : undefined;
        const body: Record<string, unknown> = { message, content: Buffer.from(content, "utf8").toString("base64") };
        if (branch) body.branch = branch;
        if (sha) body.sha = sha;
        result = await checkedJson(base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + path, token, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, true);
        resource = owner + "/" + repo + "/" + path;
      } else if (data.action === "branches.create") {
        const owner = readString(payload, "owner", 100);
        const repo = readString(payload, "repo", 100);
        const branch = readString(payload, "branch", 200);
        const baseBranch = typeof payload.baseBranch === "string" ? payload.baseBranch : "main";
        const ref = await checkedJson(base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/git/ref/heads/" + encodeURIComponent(baseBranch), token, {}, true);
        result = await checkedJson(base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/git/refs", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "refs/heads/" + branch, sha: ref.object.sha }) }, true);
        resource = owner + "/" + repo + ":" + branch;
      } else if (data.action === "pull_requests.read" || data.action === "pull_requests.create") {
        const owner = readString(payload, "owner", 100);
        const repo = readString(payload, "repo", 100);
        const url = base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/pulls";
        if (data.action === "pull_requests.read") result = await checkedJson(url + "?state=all&per_page=100", token, {}, true);
        else result = await checkedJson(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: readString(payload, "title", 200), head: readString(payload, "head", 200), base: readString(payload, "base", 200), body: typeof payload.body === "string" ? payload.body.slice(0, 10000) : "" }) }, true);
        resource = owner + "/" + repo;
      } else if (data.action === "issues.read" || data.action === "issues.create") {
        const owner = readString(payload, "owner", 100);
        const repo = readString(payload, "repo", 100);
        const url = base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/issues";
        if (data.action === "issues.read") result = await checkedJson(url + "?state=all&per_page=100", token, {}, true);
        else result = await checkedJson(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: readString(payload, "title", 200), body: typeof payload.body === "string" ? payload.body.slice(0, 10000) : "" }) }, true);
        resource = owner + "/" + repo;
      } else if (data.action === "repositories.delete") {
        const owner = readString(payload, "owner", 100);
        const repo = readString(payload, "repo", 100);
        result = await checkedJson(base + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo), token, { method: "DELETE" }, true);
        resource = owner + "/" + repo;
      } else {
        throw new Error("This GitHub action is not implemented yet.");
      }
    } else if (connection.provider === "supabase") {
      const api = "https://api.supabase.com/v1";
      if (tokenPayload.expires_at && Number(tokenPayload.expires_at) < Date.now() + 60000 && typeof tokenPayload.refresh_token === "string") {
        const clientId = process.env["SUPABASE_OAUTH_CLIENT_ID"];
        const clientSecret = process.env["SUPABASE_OAUTH_CLIENT_SECRET"];
        if (!clientId || !clientSecret) throw new Error("Supabase OAuth refresh is not configured.");
        const refreshed = await fetch(api + "/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64") },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: String(tokenPayload.refresh_token) }),
          signal: AbortSignal.timeout(15000),
        });
        const refreshedData = await refreshed.json() as Record<string, unknown>;
        if (!refreshed.ok || typeof refreshedData.access_token !== "string") throw new Error("Supabase authorization expired. Reconnect your Supabase account.");
        tokenPayload.access_token = refreshedData.access_token;
        tokenPayload.refresh_token = refreshedData.refresh_token ?? tokenPayload.refresh_token;
        tokenPayload.expires_at = Date.now() + Number(refreshedData.expires_in ?? 3600) * 1000;
        token = String(tokenPayload.access_token);
        const { error } = await supabaseAdmin.rpc("store_plugin_oauth_connection", {
          p_user_id: context.userId, p_provider: "supabase", p_display_name: connection.display_name,
          p_provider_account_id: "management-account", p_provider_username: null,
          p_scopes: ["projects.read", "database:read", "database:write"], p_token_payload: tokenPayload,
        });
        if (error) throw new Error("Could not rotate the Supabase OAuth token.");
      }
      if (data.action === "organizations.read") {
        result = await checkedJson(api + "/organizations", token);
      } else if (data.action === "projects.read") {
        result = await checkedJson(api + "/projects", token);
      } else if (data.action === "schemas.read" || data.action === "sql.read" || data.action === "sql.write" || data.action === "tables.create" || data.action === "tables.alter" || data.action === "tables.drop") {
        const ref = readString(payload, "projectRef", 64);
        const sql = data.action === "schemas.read"
          ? "select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema not in ('pg_catalog','information_schema') order by table_schema,table_name,ordinal_position limit 500"
          : readString(payload, "sql", 50000);
        const normalizedSql = sql
          .replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/g, "")
          .trim()
          .replace(/;\s*$/, "");
        if (normalizedSql.includes(";")) throw new Error("Run one SQL statement per action.");
        const first = normalizedSql.split(/\s+/)[0]?.toLowerCase();
        const readOnly = data.action === "schemas.read" || data.action === "sql.read";
        const containsDestructiveDdl = /\b(?:drop|alter|create)\s+table\b/i.test(normalizedSql);
        const containsDestructiveDml = /\b(?:delete\s+from|truncate(?:\s+table)?\b)/i.test(normalizedSql);
        if (data.action === "sql.write" && containsDestructiveDdl) throw new Error("Use the separately permissioned Create, Alter or Drop tables action for table-definition changes.");
        if (data.action === "sql.write" && containsDestructiveDml && !data.approved) throw new Error("DELETE and TRUNCATE statements require explicit confirmation.");
        if (readOnly && !["select", "with", "show", "explain"].includes(first ?? "")) throw new Error("Read-only SQL permission accepts SELECT, WITH, SHOW or EXPLAIN statements only.");
        if (!readOnly && data.action === "tables.create" && !/^create\s+table\b/i.test(normalizedSql)) throw new Error("The Create tables permission only accepts CREATE TABLE statements.");
        if (!readOnly && data.action === "tables.alter" && !/^alter\s+table\b/i.test(normalizedSql)) throw new Error("The Alter tables permission only accepts ALTER TABLE statements.");
        if (!readOnly && data.action === "tables.drop" && !/^drop\s+table\b/i.test(normalizedSql)) throw new Error("The Drop tables permission only accepts DROP TABLE statements.");
        const endpoint = readOnly ? "/projects/" + encodeURIComponent(ref) + "/database/query/read-only" : "/projects/" + encodeURIComponent(ref) + "/database/query";
        result = await checkedJson(api + endpoint, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: sql, ...(readOnly ? {} : { read_only: false }) }) });
        resource = ref;
      } else if (data.action === "projects.delete") {
        const ref = readString(payload, "projectRef", 64);
        result = await checkedJson(api + "/projects/" + encodeURIComponent(ref), token, { method: "DELETE" });
        resource = ref;
      } else {
        throw new Error("This Supabase Management action is not implemented yet.");
      }
    } else {
      throw new Error("This plugin provider does not have an action executor yet.");
    }

    const { error: auditError } = await supabaseAdmin.from("plugin_audit_logs").insert({
      user_id: context.userId, connection_id: data.connectionId, provider: connection.provider,
      action: data.action, resource, success: true, details: { approved: data.approved },
    });
    if (auditError) console.error("[Plugin Center] Audit write failed:", auditError.message);
    await db.from("user_plugin_connections").update({ last_used_at: new Date().toISOString() })
      .eq("id", data.connectionId).eq("user_id", context.userId);
    return { ok: true, result };
  });
