import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runAgentChat } from "@/lib/agent.server";

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(100_000),
  modelTier: z.enum(["fast", "balanced", "architect"]).default("fast"),
  files: z.record(z.string().max(512), z.string().max(25_000_000)).default({}),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(3000),
  })).max(8).default([]),
}).refine(({ files }) =>
  Object.keys(files).length <= 2_000 &&
  Object.values(files).reduce((total, content) => total + content.length, 0) <= 100_000_000,
  "Project context exceeds the 100 MB request limit.",
);

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authorization = request.headers.get("authorization") ?? "";
          const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
          if (!token || token.split(".").length !== 3) {
            return Response.json({ error: "Your session is missing or expired. Sign in again." }, { status: 401 });
          }

          const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
          const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
          if (!supabaseUrl || !supabaseKey) {
            return Response.json({ error: "Server configuration is missing Supabase credentials." }, { status: 500 });
          }

          const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: "Bearer " + token } },
          });
          const { data: authData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !authData.user) {
            return Response.json({ error: "Your session is invalid. Sign in again." }, { status: 401 });
          }

          const parsed = requestSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message || "Invalid chat request." }, { status: 400 });
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles").select("ai_credits").eq("id", authData.user.id).single();
          if (profileError || !profile) {
            return Response.json({ error: "Could not load your AI credit balance." }, { status: 500 });
          }
          const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
            _user_id: authData.user.id, _role: "admin",
          });
          if (roleError) {
            return Response.json({ error: "Could not verify your account permissions." }, { status: 500 });
          }
          const creditCost = parsed.data.modelTier === "architect" ? 3
            : parsed.data.modelTier === "balanced" ? 2 : 1;
          if (!isAdmin && Number(profile.ai_credits ?? 0) < creditCost) {
            return Response.json({ error: `This model requires ${creditCost} AI credits. Earn credits or choose Fast.` }, { status: 402 });
          }

          const result = await runAgentChat(parsed.data);
          if (!isAdmin) {
            const { error: creditError } = await supabase.rpc("consume_ai_credits", {
              p_amount: creditCost,
              p_description: `Agent chat · ${parsed.data.modelTier} model`,
            });
            if (creditError) {
              console.error("[ExpertAI chat] Credit deduction failed:", creditError);
              return Response.json({ error: "Your reply was generated, but credits could not be updated. Please contact support." }, { status: 500 });
            }
          }
          return Response.json({ reply: result.message, updatedFiles: {} }, { status: 200 });
        } catch (error) {
          console.error("[ExpertAI chat API] Request failed:", error);
          const rawMessage = error instanceof Error ? error.message : "ExpertAI could not complete your request.";
          const message = rawMessage.replace(/Kilo(?: Gateway)?/gi, "ExpertAI");
          const status = /rate limit|temporarily busy|temporarily unavailable|not configured/i.test(message) ? 503
            : /timeout|timed out|abort/i.test(message) ? 504 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
