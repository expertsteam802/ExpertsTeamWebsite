import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateGeminiContent, isProviderCoolingDown, markProviderCoolingDown } from "@/lib/gemini.server";

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(6000),
  history: z.array(z.object({
    role: z.string().max(20),
    content: z.string().max(4000),
  })).max(10).optional(),
  attachments: z.array(z.object({
    name: z.string().max(255),
    mimeType: z.string().max(150).optional(),
    text: z.string().max(200000).optional(),
    dataUrl: z.string().max(4000000).optional(),
  })).max(5).optional(),
}).superRefine((data, context) => {
  const totalAttachmentBytes = (data.attachments ?? []).reduce(
    (total, file) => total + (file.dataUrl?.length ?? 0) + (file.text?.length ?? 0),
    0,
  );
  if (totalAttachmentBytes > 5000000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attachments are too large. Please upload smaller files.",
      path: ["attachments"],
    });
  }
});

export const Route = createFileRoute("/api/ai/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authorization = request.headers.get("authorization") ?? "";
          const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
          if (!token || token.split(".").length !== 3) {
            return Response.json({ error: "Please sign in again to use Expert AI." }, { status: 401 });
          }

          const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
          const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
          if (!supabaseUrl || !supabaseKey) {
            return Response.json({ error: "Supabase server configuration is missing." }, { status: 500 });
          }

          const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: authData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !authData.user) {
            return Response.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });
          }

          const { error: creditError } = await supabase.rpc("consume_ai_credit");
          if (creditError) {
            return Response.json({ error: creditError.message }, { status: 402 });
          }

          const parsed = requestSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: "The message or attachments are invalid or too large." }, { status: 400 });
          }

          const { prompt, history = [], attachments = [] } = parsed.data;
          const attachmentParts = attachments.flatMap((file) => {
            const parts: Array<Record<string, unknown>> = [
              { text: `Attachment: ${file.name}` },
            ];
            if (file.text) {
              parts.push({ text: file.text.slice(0, 12000) });
            } else if (file.dataUrl) {
              const match = file.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: file.mimeType || match[1],
                    data: match[2],
                  },
                });
              } else {
                parts.push({ text: "[This attachment format could not be read]" });
              }
            } else {
              parts.push({ text: "[No readable text extracted]" });
            }
            return parts;
          });
          const contents = [
            ...history.slice(-8).map((message) => ({
              role: message.role === "ai" || message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content.slice(0, 4000) }],
            })),
            { role: "user", parts: [{ text: prompt }, ...attachmentParts] },
          ];

          const systemText = "You are Expert AI for ExpertsTeam. Be accurate, direct, practical, and helpful. Stream your answer naturally. Use markdown and code fences when useful. Never claim access to private user data unless it was supplied in the conversation.";
          const providerOrder = (process.env["AI_PROVIDER_ORDER"] || "gemini,groq,mistral,openrouter,cloudflare")
            .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
          const geminiKey = process.env["GEMINI_API_KEY"]?.trim();

          // Keep true token streaming for Gemini when it is the first configured provider.
          if (geminiKey && providerOrder[0] === "gemini" && !isProviderCoolingDown("gemini")) {
            const model = process.env["GEMINI_CHAT_MODEL"] || process.env["GEMINI_MODEL"] || "gemini-3.6-flash";
            const upstream = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
              {
                method: "POST",
                headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: systemText }] },
                  contents,
                  generationConfig: { maxOutputTokens: 8192 },
                }),
                signal: request.signal,
              },
            );
            if (upstream.ok && upstream.body) {
              return new Response(upstream.body, {
                headers: {
                  "Content-Type": "text/event-stream; charset=utf-8",
                  "Cache-Control": "no-cache, no-transform",
                  "X-Accel-Buffering": "no",
                },
              });
            }
            if (!upstream.ok) {
              await upstream.text();
              if (upstream.status === 429 || upstream.status >= 500) markProviderCoolingDown("gemini", upstream.status === 429 ? 60 : 20);
            }
          }

          const fallbackOrder = geminiKey && providerOrder[0] === "gemini"
            ? providerOrder.slice(1)
            : providerOrder;
          const result = await generateGeminiContent({
            systemInstruction: { parts: [{ text: systemText }] },
            contents: contents.map((item) => ({
              role: item.role === "model" ? "model" as const : "user" as const,
              parts: item.parts.filter((part): part is { text: string } => typeof part.text === "string"),
            })),
            generationConfig: { maxOutputTokens: 8192 },
          }, undefined, fallbackOrder);

          const streamPayload = `data: ${JSON.stringify(result)}\n\ndata: [DONE]\n\n`;
          return new Response(streamPayload, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
            },
          });
        } catch (error) {
          console.error("[Expert AI stream]", error);
          return Response.json({
            error: error instanceof Error ? error.message : "Expert AI could not complete the request.",
          }, { status: 500 });
        }
      },
    },
  },
});
