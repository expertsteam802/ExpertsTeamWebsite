import { AI_PLAN_PROMPT, AI_SYSTEM_PROMPT, AI_WORKSPACE_PROMPT } from "./ai-prompt";
import { generateGeminiContent } from "./gemini.server";

export type AiAttachment = {
  name: string;
  mimeType?: string;
  text?: string;
  dataUrl?: string;
  size?: number;
};

function buildAttachmentSummary(attachments: AiAttachment[] = []) {
  if (!attachments.length) return "";

  return attachments
    .map((attachment) => {
      const label = attachment.name || "attachment";
      const content = attachment.text?.trim() || attachment.dataUrl || "";
      const safeContent = content.length > 4000 ? `${content.slice(0, 4000)}…` : content;
      return `Attachment: ${label}\nMime: ${attachment.mimeType || "unknown"}\n${safeContent}`;
    })
    .join("\n\n");
}

export async function askChrisAi({
  prompt,
  mode,
  history = [],
  attachments = [],
}: {
  prompt: string;
  mode: "chat" | "workspace" | "plan";
  history?: { role: string; content: string }[];
  attachments?: AiAttachment[];
}, apiKey?: string): Promise<{ reply: string }> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new Error("Please type a message first.");

  const systemPrompt =
    mode === "workspace"
      ? AI_WORKSPACE_PROMPT
      : mode === "plan"
        ? AI_PLAN_PROMPT
        : AI_SYSTEM_PROMPT;

  const promptWithAttachments = [
    cleanPrompt,
    buildAttachmentSummary(attachments),
  ]
    .filter(Boolean)
    .join("\n\n");

  const json = await generateGeminiContent(
    {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        ...history.slice(-10).map((message) => ({
          role:
            message.role === "ai" || message.role === "assistant"
              ? ("model" as const)
              : ("user" as const),
          parts: [{ text: String(message.content ?? "").slice(0, 4000) }],
        })),
        { role: "user", parts: [{ text: promptWithAttachments }] },
      ],
      generationConfig: {
        maxOutputTokens: mode === "workspace" ? 16384 : 8192,
      },
    },
    apiKey,
  );

  const candidate = json.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Expert AI's answer was too long. Please try a shorter request.");
  }

  const reply =
    candidate?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!reply) {
    throw new Error(
      json.promptFeedback?.blockReason
        ? "Expert AI couldn't answer that request. Please rephrase it and try again."
        : "Expert AI returned an empty answer. Please try again.",
    );
  }

  return { reply };
}

export async function generateExpertImage(
  { prompt }: { prompt: string },
  apiKey?: string,
): Promise<{ mimeType: string; data: string }> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new Error("Please describe the image you want.");

  const resolvedKey = apiKey || process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  if (!resolvedKey) {
    throw new Error("Expert AI image generation is not configured. Add GEMINI_API_KEY to the server environment.");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": resolvedKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: cleanPrompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(45000),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${text || "unknown error"}`);
  }

  const json = (await response.json()) as {
    candidates?: {
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }[];
  };

  const inline = json.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data);

  if (!inline?.inlineData?.data) {
    throw new Error("Image generation returned no image data.");
  }

  return {
    mimeType: inline.inlineData.mimeType || "image/png",
    data: inline.inlineData.data,
  };
}
