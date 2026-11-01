import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const codingRequest = z
  .object({
    prompt: z.string().trim().min(1).max(16000),
    files: z.record(z.string().max(512), z.string().max(100000)),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) }))
      .max(8),
  })
  .refine(
    ({ files }) =>
      Object.keys(files).length <= 80 &&
      Object.values(files).reduce((total, content) => total + content.length, 0) <= 200000,
    "The project is too large to send to the agent.",
  );

export const runCodingAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => codingRequest.parse(input))
  .handler(async ({ data }) => {
    const { runAgent } = await import("./agent.server");
    return runAgent(data, process.env["GEMINI_API_KEY"]);
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
        ...(await pushToGithub({ ...data, message: "Update from Experts Team agent" })),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Push failed" };
    }
  });
