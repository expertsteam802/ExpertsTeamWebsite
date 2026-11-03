import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

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
  })).max(5).optional(),
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

          const supabaseUrl = process.env["SUPABASE_URL"];
          const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
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

          const parsed = requestSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: "The message or attachments are invalid or too large." }, { status: 400 });
          }

          const apiKey = process.env["GEMINI_API_KEY"];
          if (!apiKey) {
            return Response.json({ error: "Expert AI is not configured on the server. Add GEMINI_API_KEY to the deployment environment." }, { status: 503 });
          }

          const { prompt, history = [], attachments = [] } = parsed.data;
          const attachmentText = attachments
            .map((file) => `Attachment: ${file.name}\\n${file.text?.slice(0, 4000) ?? "[No readable text extracted]"}`)
            .join("\\n\\n");
          const contents = [
            ...history.slice(-8).map((message) => ({
              role: message.role === "ai" || message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content.slice(0, 4000) }],
            })),
            { role: "user", parts: [{ text: [prompt, attachmentText].filter(Boolean).join("\\n\\n") }] },
          ];

          const model = process.env["GEMINI_CHAT_MODEL"] || "gemini-3.8-flash";
          const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
            {
              method: "POST",
              headers: {
                "x-goog-api-key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{
                    text: "You are Expert AI for Experts Team. Be accurate, direct, practical, and helpful. Stream your answer naturally. Use markdown and code fences when useful. Never claim access to private user data unless it was supplied in the conversation.",
                  }],
                },
                contents,
                generationConfig: { maxOutputTokens: 8192 },
              }),
              signal: request.signal,
            },
          );

          if (!upstream.ok) {
            const errorText = await upstream.text();
            let message = `Gemini request failed (HTTP ${upstream.status}).`;
            try {
              const errorJson = JSON.parse(errorText) as { error?: { message?: string } };
              message = errorJson.error?.message || message;
            } catch {
              // Keep the concise status message when the provider did not return JSON.
            }
            return Response.json({ error: message }, { status: upstream.status });
          }

          if (!upstream.body) {
            return Response.json({ error: "The AI provider did not return a response stream." }, { status: 502 });
          }

          return new Response(upstream.body, {
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
