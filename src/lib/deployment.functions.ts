import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setStagingPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    projectId: z.string().uuid(),
    password: z.string().min(8).max(128),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("agent_projects").select("id").eq("id", data.projectId).eq("user_id", context.userId).maybeSingle();
    if (projectError || !project) throw new Error("Project not found or access denied.");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(data.password, salt, 64).toString("hex");
    const { error } = await supabaseAdmin.from("agent_project_staging_access").upsert({
      project_id: data.projectId,
      user_id: context.userId,
      password_salt: salt,
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    if (error) throw new Error("Could not save the staging password.");
    return { saved: true };
  });

export const getStagingDeployment = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
    password: z.string().min(1).max(128),
  }).parse(input))
  .handler(async ({ data }) => {
    const { data: deployment, error: deploymentError } = await supabaseAdmin
      .from("agent_project_deployments")
      .select("project_id,deployment_url")
      .eq("slug", data.slug)
      .eq("environment", "staging")
      .eq("status", "success")
      .eq("is_current", true)
      .maybeSingle();
    if (deploymentError || !deployment) throw new Error("The staging app is unavailable or the password is incorrect.");
    const { data: access, error: accessError } = await supabaseAdmin
      .from("agent_project_staging_access")
      .select("password_salt,password_hash")
      .eq("project_id", deployment.project_id)
      .maybeSingle();
    if (accessError || !access) throw new Error("The staging app is unavailable or the password is incorrect.");
    const provided = scryptSync(data.password, access.password_salt, 64);
    const expected = Buffer.from(access.password_hash, "hex");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new Error("The staging app is unavailable or the password is incorrect.");
    }
    const { data: project } = await supabaseAdmin.from("agent_projects").select("name").eq("id", deployment.project_id).maybeSingle();
    return { deploymentUrl: deployment.deployment_url, name: project?.name ?? "Staging app" };
  });
