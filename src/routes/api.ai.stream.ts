import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  compactSmartContents,
  type SmartContent,
  type SmartPart,
} from "@/lib/smart-processing.server";
import { generateExpertAiContent } from "@/lib/kilo-gateway.server";

function assistantMessageResponse(message: string): Response {
  const encoder = new TextEncoder();
  const event = { candidates: [{ content: { parts: [{ text: message }] } }] };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

const requestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(6000),
    history: z
      .array(
        z.object({
          role: z.string().max(20),
          content: z.string().max(200000),
        }),
      )
      .max(100)
      .optional(),
    attachments: z
      .array(
        z.object({
          name: z.string().max(255),
          mimeType: z.string().max(150).optional(),
          text: z.string().max(200000).optional(),
          dataUrl: z.string().max(1400000).optional(),
        }),
      )
      .max(5)
      .optional(),
  })
  .superRefine((data, context) => {
    const totalAttachmentBytes = (data.attachments ?? []).reduce(
      (total, file) => total + (file.dataUrl?.length ?? 0) + (file.text?.length ?? 0),
      0,
    );
    if (totalAttachmentBytes > 3200000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attachments are too large. Please upload smaller files.",
        path: ["attachments"],
      });
    }
    const totalHistoryCharacters = (data.history ?? []).reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (totalHistoryCharacters > 600000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conversation context is too large to process in one request.",
        path: ["history"],
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
          const isGuest = !token;
          if (token && token.split(".").length !== 3) {
            return Response.json(
              { error: "Your session is invalid. Please sign in again." },
              { status: 401 },
            );
          }
          if (isGuest) {
            const origin = request.headers.get("origin");
            if (origin && origin !== new URL(request.url).origin) {
              return Response.json(
                { error: "Guest chat requests must come from this website." },
                { status: 403 },
              );
            }
          }

          let guestSessionId = "";
          if (isGuest) {
            guestSessionId = request.headers.get("x-guest-session") || "";
            if (!/^[0-9a-f-]{36}$/i.test(guestSessionId)) {
              return Response.json(
                { error: "A valid guest session is required." },
                { status: 400 },
              );
            }
          }

          const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
          const supabaseKey =
            process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
          if (!supabaseUrl || !supabaseKey) {
            return Response.json(
              { error: "Supabase server configuration is missing." },
              { status: 500 },
            );
          }

          const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
          });
          if (!isGuest) {
            const { data: authData, error: authError } = await supabase.auth.getUser(token);
            if (authError || !authData.user) {
              return Response.json(
                { error: "Your session is invalid. Please sign in again." },
                { status: 401 },
              );
            }
          }

          const parsed = requestSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json(
              { error: "The message or attachments are invalid or too large." },
              { status: 400 },
            );
          }
          if (isGuest && parsed.data.attachments?.some((file) => Boolean(file.dataUrl))) {
            return Response.json(
              {
                error:
                  "Sign in to use image analysis. Guest chat currently supports text and document questions.",
              },
              { status: 403 },
            );
          }

          let guestServiceClient: ReturnType<typeof createClient> | null = null;
          let guestIpHash = "";
          if (isGuest) {
            const serviceRoleKey =
              process.env["SUPABASE_SECRET_KEY"] ||
              process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
              process.env["SERVICE_ROLE_KEY"];
            if (!serviceRoleKey) {
              console.error(
                "[ExpertAI] Guest access is disabled: configure SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY as a server-only Vercel environment variable.",
              );
              return Response.json(
                {
                  error:
                    "Guest access is temporarily unavailable. Sign in to continue or try again later.",
                },
                { status: 503 },
              );
            }
            const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
            const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(`${ip}:${guestSessionId}:${serviceRoleKey}`),
            );
            guestIpHash = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            guestServiceClient = createClient(supabaseUrl, serviceRoleKey, {
              auth: { persistSession: false, autoRefreshToken: false },
            });
            const { data: canUseCredits, error: guestCheckError } = await guestServiceClient.rpc(
              "can_use_guest_ai_credit",
              { p_ip_hash: guestIpHash },
            );
            if (guestCheckError) {
              return Response.json(
                { error: "Guest chat credits could not be checked. Please try again later." },
                { status: 503 },
              );
            }
            if (!canUseCredits) {
              return assistantMessageResponse(
                "You've reached the 15-message guest limit for this 24-hour period. Sign in to use unlimited ExpertAI chat.",
              );
            }
          }

          const consumeGuestCredit = async (): Promise<string | null> => {
            if (!guestServiceClient || !guestIpHash)
              return "Guest access is temporarily unavailable. Please try again later.";
            const { data: allowed, error } = await guestServiceClient.rpc(
              "consume_guest_ai_credit",
              { p_ip_hash: guestIpHash },
            );
            if (error) return "Guest chat is temporarily unavailable. Please try again later.";
            if (!allowed)
              return "You've reached the 15-message guest limit for this 24-hour period. Sign in to use unlimited ExpertAI chat.";
            return null;
          };

          const { prompt, history = [], attachments = [] } = parsed.data;
          const perAttachmentTextBudget = Math.max(
            1200,
            Math.floor(12000 / Math.max(1, attachments.length)),
          );
          const attachmentParts = attachments.flatMap((file): SmartPart[] => {
            const parts: SmartPart[] = [{ text: `Attachment: ${file.name}` }];
            if (file.text) {
              const sourceText = file.text;
              const text =
                sourceText.length <= perAttachmentTextBudget
                  ? sourceText
                  : sourceText.slice(0, Math.floor(perAttachmentTextBudget * 0.4)) +
                    "\n[Middle of this attachment omitted to fit the shared context budget]\n" +
                    sourceText.slice(-Math.floor(perAttachmentTextBudget * 0.6));
              parts.push({ text });
            } else if (file.dataUrl) {
              const match = file.dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: file.mimeType || match[1],
                    data: match[2],
                  },
                });
                parts.push({
                  text: "Image attachment. If this provider cannot inspect images, ask the user to describe it.",
                });
              } else {
                parts.push({ text: "[This attachment format could not be read]" });
              }
            } else {
              parts.push({ text: "[No readable text extracted]" });
            }
            return parts;
          });
          const contents: SmartContent[] = [
            ...history.slice(-100).map((message) => ({
              role:
                message.role === "ai" || message.role === "assistant"
                  ? ("model" as const)
                  : ("user" as const),
              parts: [{ text: message.content }],
            })),
            { role: "user", parts: [{ text: prompt }, ...attachmentParts] },
          ];

          const compactedContents = compactSmartContents(contents);
          const systemText =
            "Your name is ExpertAI. You were created by M.Chris.T for ExpertsTeam. If asked your name or creator, clearly answer: I am ExpertAI, created by M.Chris.T. Never identify yourself as an underlying model or provider; you are ExpertAI, the assistant provided by ExpertsTeam. You are a practical assistant for developers and creators on ExpertsTeam. Answer the exact question first. Keep ordinary answers brief: usually 1–5 short sentences or a few bullets. Expand only when the user asks for detail, a tutorial, a plan, or code. Avoid long introductions, repeated conclusions, filler, and unnecessary jargon. For code requests, provide complete usable code and explain only the key integration steps. Ask one focused clarification only when essential. Be friendly, accurate, and honest about what you have not tested.";
          // Guest and signed-in chat share the server-selected provider transport
          // (OpenAPIs with transient-failure fallback to Kilo, or Kilo directly).
          const generateReply = (input: Parameters<typeof generateExpertAiContent>[0]) =>
            generateExpertAiContent(input);
          let outputBudgetPerRound = 8192;
          let result = await generateReply(
            {
              systemInstruction: { parts: [{ text: systemText }] },
              contents: compactedContents,
              generationConfig: { maxOutputTokens: outputBudgetPerRound },
            },
          );
          let answerText =
            result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
          let finishReason = result.candidates?.[0]?.finishReason ?? "STOP";

          // Continue a long answer in bounded pieces instead of silently accepting
          // a provider's per-response output ceiling.
          for (let round = 0; round < 4 && finishReason === "MAX_TOKENS" && answerText.trim(); round++) {
            outputBudgetPerRound = Math.max(2048, Math.floor(outputBudgetPerRound / 2));
            result = await generateReply(
              {
                systemInstruction: { parts: [{ text: systemText }] },
                contents: [
                  ...compactedContents,
                  { role: "model", parts: [{ text: answerText.slice(-12000) }] },
                  {
                    role: "user",
                    parts: [{
                      text:
                        "You are the next expert in Experts Routing. Review the shared draft for gaps or contradictions, then continue from the exact point where it stopped. Do not repeat completed sections. Preserve useful detail and complete unfinished explanations, lists and code blocks. Original request: " +
                        prompt.slice(0, 4000),
                    }],
                  },
                ],
                generationConfig: { maxOutputTokens: outputBudgetPerRound },
              },
            );
            const nextText =
              result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
            if (!nextText.trim()) break;
            answerText += nextText;
            finishReason = result.candidates?.[0]?.finishReason ?? "STOP";
          }
          if (finishReason === "MAX_TOKENS") {
            answerText +=
              "\n\nI reached the current multi-round response limit. Ask me to continue and I will pick up from here.";
          }

          if (isGuest) {
            const creditError = await consumeGuestCredit();
            if (creditError) {
              return assistantMessageResponse(creditError);
            }
          }
          const encoder = new TextEncoder();
          let cursor = 0;
          const typedStream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              if (cursor >= answerText.length) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
              // The selected gateway currently returns a completed response rather than
              // upstream token events. Do not add an artificial per-chunk delay here:
              // flush larger chunks immediately so the UI does not make replies slower.
              const text = answerText.slice(cursor, cursor + 160);
              cursor += text.length;
              const event = { candidates: [{ content: { parts: [{ text }] } }] };
              controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
            },
          });
          return new Response(typedStream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[ExpertAI stream]", message);
          if (/(quota is exhausted|HTTP 429|rate limit)|free-model rate limit|upstream model provider returned HTTP 429/i.test(message)) {
            return assistantMessageResponse("ExpertAI is busy right now. Please wait a moment and send your message again.");
          }
          if (/Kilo Gateway|not configured|Guest access is temporarily unavailable|Guest chat credits could not be checked/i.test(message)) {
            return assistantMessageResponse("ExpertAI is temporarily unavailable. Please try again shortly.");
          }
          if (/cannot fit the current request/i.test(message)) {
            return Response.json({ error: message }, { status: 413 });
          }
          if (/does not support image input/i.test(message)) {
            return Response.json({ error: message }, { status: 400 });
          }
          return assistantMessageResponse(
            "ExpertAI is temporarily unavailable right now. Please try again shortly.",
          );
        }
      },
    },
  },
});
