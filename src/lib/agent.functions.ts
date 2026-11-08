import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const referenceImageSchema = z.object({
  name: z.string().max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string().min(100).max(3_000_000),
});

const codingRequest = z
  .object({
    prompt: z.string().trim().min(1).max(16000),
    files: z.record(z.string().max(512), z.string().max(100000)),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) }))
      .max(8),
    referenceImage: referenceImageSchema.optional(),
    referenceImages: z.array(referenceImageSchema).max(3).optional(),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 80 &&
      Object.values(files).reduce((total, content) => total + content.length, 0) <= 200000,
    "The project is too large to send to the agent.",
  )
  .refine(({ referenceImage, referenceImages }) => {
    const references = referenceImages?.length
      ? referenceImages
      : referenceImage
        ? [referenceImage]
        : [];
    return (
      references.length <= 3 &&
      references.reduce((total, image) => total + image.data.length, 0) <= 8_000_000
    );
  }, "Attach up to three visual references with a combined size under 8 MB.");

export const runCodingAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => codingRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("ai_credits")
      .eq("id", context.userId)
      .single();
    if (profileError) throw new Error(profileError.message);
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin && profile.ai_credits < 1)
      throw new Error(
        "You have no AI credits remaining on this account. Ask an administrator about your usage allowance.",
      );
    const { runAgent } = await import("./agent.server");
    const result = await runAgent(data, process.env["GEMINI_API_KEY"]);
    if (!isAdmin) {
      const { error: creditError } = await context.supabase.rpc("consume_ai_credit");
      if (creditError) throw new Error(creditError.message);
    }
    return result;
  });

export const pushProjectToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string; repo: string; files: Record<string, string> }) => {
    const token = String(input?.token ?? "").trim();
    const repo = String(input?.repo ?? "").trim();
    if (!token) throw new Error("Paste a GitHub access token.");
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo))
      throw new Error("Repository name can use letters, numbers, - _ .");
    return { token, repo, files: input.files ?? {} };
  })
  .handler(async ({ data }) => {
    try {
      const { pushToGithub } = await import("./agent.server");
      return {
        ok: true as const,
        ...(await pushToGithub({ ...data, message: "Update from ExpertsTeam agent" })),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Push failed" };
    }
  });

const previewRequest = z
  .object({
    projectId: z.string().uuid(),
    files: z.record(z.string().max(512), z.string().max(150000)),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 120 &&
      Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 1_000_000,
    "The project is too large to preview.",
  );

async function assertProjectOwnership(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  projectId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("agent_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not verify project access.");
  if (!data) throw new Error("This project is not available in your account.");
}

export const startAgentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => previewRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { startCloudProjectPreview } = await import("./agent-sandbox.server");
    return startCloudProjectPreview(data.projectId, data.files);
  });

const terminalStartRequest = z
  .object({
    projectId: z.string().uuid(),
    files: z.record(z.string().max(512), z.string().max(150000)),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 120 &&
      Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 1_000_000,
    "The project is too large to open in the Linux terminal.",
  );

export const startAgentTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => terminalStartRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { startCloudProjectTerminal } = await import("./agent-sandbox.server");
    return startCloudProjectTerminal(data.projectId, data.files);
  });

const publishRequest = z
  .object({
    projectId: z.string().uuid(),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
    files: z.record(z.string().max(512), z.string().max(150000)),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 120 &&
      Object.values(files).reduce((sum, value) => sum + value.length, 0) <= 1_000_000,
    "The project is too large to publish.",
  );

export const syncAgentTerminalFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { readCloudProjectFiles } = await import("./agent-sandbox.server");
    return readCloudProjectFiles(data.projectId);
  });

export const publishAgentProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => publishRequest.parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const now = new Date().toISOString();
    const { error: startError } = await context.supabase
      .from("agent_projects")
      .update({ last_build_status: "building", last_build_at: now })
      .eq("id", data.projectId)
      .eq("user_id", context.userId);
    if (startError) throw new Error("Could not start the app publishing job.");

    try {
      const { publishCloudProject } = await import("./agent-sandbox.server");
      const result = await publishCloudProject(data.projectId, data.files, data.slug);
      const { data: saved, error: saveError } = await context.supabase
        .from("agent_projects")
        .update({
          published: true,
          slug: data.slug,
          deployment_url: result.url,
          last_build_status: "success",
          last_build_at: new Date().toISOString(),
        })
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .select("id")
        .maybeSingle();
      if (saveError)
        throw new Error("The app was built, but its published URL could not be saved.");
      if (!saved) throw new Error("The app was built, but the project is no longer available.");
      return result;
    } catch (error) {
      await context.supabase
        .from("agent_projects")
        .update({ last_build_status: "failed", last_build_at: new Date().toISOString() })
        .eq("id", data.projectId)
        .eq("user_id", context.userId);
      throw error;
    }
  });

export const runAgentTerminalCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        command: z.string().trim().min(1).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { runCloudProjectCommand } = await import("./agent-sandbox.server");
    return runCloudProjectCommand(data.projectId, data.command);
  });

export const stopAgentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProjectOwnership(context.supabase, data.projectId, context.userId);
    const { stopCloudProjectPreview } = await import("./agent-sandbox.server");
    return stopCloudProjectPreview(data.projectId);
  });
