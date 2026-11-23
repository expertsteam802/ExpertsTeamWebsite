import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptProjectSecret } from "./project-secrets.server";

const projectIdSchema = z.string().uuid();
const envKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/).refine(
  (key) => !key.startsWith("VITE_"),
  "VITE_ variables are public in browser builds and cannot be stored as secrets.",
);

async function assertOwnedProject(supabase: any, userId: string, projectId: string) {
  const { data, error } = await supabase.from("agent_projects")
    .select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not verify project ownership: " + error.message);
  if (!data) throw new Error("Project not found or access denied.");
}

export const listProjectEnvironmentKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: projectIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnedProject(context.supabase, context.userId, data.projectId);
    const { data: rows, error } = await (context.supabase as any).from("agent_project_env_vars")
      .select("key, updated_at").eq("project_id", data.projectId).eq("user_id", context.userId)
      .order("key", { ascending: true });
    if (error) throw new Error("Could not list environment variable names: " + error.message);
    return { variables: (rows ?? []).map((row: { key: string; updated_at: string }) => ({
      key: row.key, updatedAt: row.updated_at, configured: true,
    })) };
  });

export const saveProjectEnvironmentVariable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: projectIdSchema,
    key: envKeySchema,
    value: z.string().min(1).max(32_768),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnedProject(context.supabase, context.userId, data.projectId);
    const encrypted = encryptProjectSecret(data.value);
    const { error } = await (context.supabase as any).from("agent_project_env_vars").upsert({
      project_id: data.projectId, user_id: context.userId, key: data.key, ...encrypted,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,user_id,key" });
    if (error) throw new Error("Could not save the environment variable: " + error.message);
    return { ok: true, key: data.key };
  });

export const deleteProjectEnvironmentVariable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: projectIdSchema, key: envKeySchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnedProject(context.supabase, context.userId, data.projectId);
    const { error } = await (context.supabase as any).from("agent_project_env_vars")
      .delete().eq("project_id", data.projectId).eq("user_id", context.userId).eq("key", data.key);
    if (error) throw new Error("Could not delete the environment variable: " + error.message);
    return { ok: true, key: data.key };
  });
