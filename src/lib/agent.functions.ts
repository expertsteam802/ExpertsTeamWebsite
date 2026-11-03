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

export const createCodingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const parsed = z
      .object({
        prompt: z.string().trim().min(1).max(16000),
        files: z.record(z.string(), z.string().max(100000)),
      })
      .refine(
        ({ files }) =>
          Object.keys(files).length <= 80 &&
          Object.values(files).reduce((total, content) => total + content.length, 0) <= 200000,
        "The project is too large to plan in one request.",
      )
      .parse(input);
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("ai_credits,ai_subscribed,ai_subscription_expires_at")
      .eq("id", context.userId)
      .single();
    if (profileError) throw new Error(profileError.message);
    const studioActive =
      profile.ai_subscribed &&
      (!profile.ai_subscription_expires_at ||
        new Date(profile.ai_subscription_expires_at).getTime() > Date.now());
    if (!studioActive)
      throw new Error(
        "Studio app creation requires an active $1 / 30-day plan. Use the Upgrade button in AI Studio to subscribe.",
      );
    if (profile.ai_credits < 1)
      throw new Error(
        "You have no AI credits remaining. Renew your Studio plan to continue building.",
      );
    const { createAgentPlan } = await import("./agent.server");
    const plan = await createAgentPlan(data.prompt, data.files);
    const { error: creditError } = await context.supabase.rpc("consume_ai_credit");
    if (creditError) throw new Error(creditError.message);
    return plan;
  });

export const runCodingAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => codingRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("ai_credits,ai_subscribed,ai_subscription_expires_at")
      .eq("id", context.userId)
      .single();
    if (profileError) throw new Error(profileError.message);
    const studioActive =
      profile.ai_subscribed &&
      (!profile.ai_subscription_expires_at ||
        new Date(profile.ai_subscription_expires_at).getTime() > Date.now());
    if (!studioActive)
      throw new Error(
        "Studio app creation requires an active $1 / 30-day plan. Use the Upgrade button in AI Studio to subscribe.",
      );
    if (profile.ai_credits < 1)
      throw new Error(
        "You have no AI credits remaining. Renew your Studio plan to continue building.",
      );
    const { runAgent } = await import("./agent.server");
    const result = await runAgent(data, process.env["GEMINI_API_KEY"]);
    const { error: creditError } = await context.supabase.rpc("consume_ai_credit");
    if (creditError) throw new Error(creditError.message);
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
