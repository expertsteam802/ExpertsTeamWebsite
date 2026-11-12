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
    let result: Awaited<ReturnType<typeof runAgent>>;
    try {
      result = await runAgent(data, process.env["GEMINI_API_KEY"]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[ExpertAI coding agent provider failure]", detail);
      if (/Qwen\/Ollama|Groq|Gemini|OpenRouter|Mistral|Cloudflare|HTTP 4\d\d|HTTP 5\d\d|fetch failed|timed out|timeout/i.test(detail)) {
        throw new Error("ExpertAI is temporarily unavailable. Your existing project files were not replaced. Please retry shortly.");
      }
      throw error;
    }
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
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("is_subscribed")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error("Could not verify the account plan before starting the preview.");
    const { startCloudProjectPreview } = await import("./agent-sandbox.server");
    return startCloudProjectPreview(data.projectId, data.files, profile.is_subscribed === true);
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
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("is_subscribed")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error("Could not verify the account plan before stopping the preview.");
    const { stopCloudProjectPreview } = await import("./agent-sandbox.server");
    return stopCloudProjectPreview(data.projectId, profile.is_subscribed === true);
  });
