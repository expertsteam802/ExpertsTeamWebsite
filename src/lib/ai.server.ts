import { AI_SYSTEM_PROMPT, AI_WORKSPACE_PROMPT } from "./ai-prompt";
import { generateGeminiContent } from "./gemini.server";

export async function askChrisAi({
  prompt,
  mode,
  history = [],
}: {
  prompt: string;
  mode: "chat" | "workspace";
  history?: { role: string; content: string }[];
}): Promise<{ reply: string }> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new Error("Please type a message first.");

  const json = await generateGeminiContent({
    systemInstruction: {
      parts: [{ text: mode === "workspace" ? AI_WORKSPACE_PROMPT : AI_SYSTEM_PROMPT }],
    },
    contents: [
      ...history.slice(-10).map((message) => ({
        role:
          message.role === "ai" || message.role === "assistant"
            ? ("model" as const)
            : ("user" as const),
        parts: [{ text: String(message.content ?? "").slice(0, 4000) }],
      })),
      { role: "user", parts: [{ text: cleanPrompt }] },
    ],
    generationConfig: { maxOutputTokens: mode === "workspace" ? 16384 : 4096 },
  });

  const candidate = json.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini's answer was too long. Please try a shorter request.");
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
        ? "Gemini couldn't answer that request. Please rephrase it and try again."
        : "Gemini returned an empty answer. Please try again.",
    );
  }
  return { reply };
}
