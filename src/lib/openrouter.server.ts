import { compactSmartRequest } from "./smart-processing.server";
import type { GeminiRequest, GeminiResponse } from "./gemini.server";

type OpenRouterMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterMessagePart[];
};

function toMessages(request: GeminiRequest): OpenRouterMessage[] {
  const system = request.systemInstruction.parts.map((part) => part.text).join("\n").slice(0, 12000);
  const messages: OpenRouterMessage[] = [{ role: "system", content: system }];
  for (const item of request.contents.slice(-101)) {
    const parts: OpenRouterMessagePart[] = [];
    for (const part of item.parts) {
      if (part.text) parts.push({ type: "text", text: part.text });
      if (part.inlineData?.data) {
        parts.push({
          type: "image_url",
          image_url: {
            url: "data:" + (part.inlineData.mimeType || "image/jpeg") + ";base64," + part.inlineData.data,
          },
        });
      }
    }
    if (!parts.length) continue;
    const hasImage = parts.some((part) => part.type === "image_url");
    messages.push({
      role: item.role === "model" ? "assistant" : "user",
      content: hasImage ? parts : parts.map((part) => part.type === "text" ? part.text : "").join("\n"),
    });
  }
  return messages;
}

/** Guest ExpertAI routes through Groq first, then OpenRouter as a fallback.
 * Both keys stay server-side; neither provider is exposed as the product brand.
 */
export async function generateOpenRouterContent(request: GeminiRequest): Promise<GeminiResponse> {
  const activeRequest = compactSmartRequest(request);
  const messages = toMessages(activeRequest);
  const maxTokens = Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 8192);
  const groqKey = process.env["GROQ_API_KEY"]?.trim();
  const openRouterKey = process.env["OPENROUTER_API_KEY"]?.trim();
  const providers = [
    ...(groqKey ? [{ name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: groqKey, model: process.env["GROQ_MODEL"]?.trim() || "llama-3.3-70b-versatile" }] : []),
    ...(openRouterKey ? [{ name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", key: openRouterKey, model: process.env["OPENROUTER_MODEL"]?.trim() || "openrouter/free" }] : []),
  ];
  if (!providers.length) {
    throw new Error("ExpertAI guest service is temporarily unavailable. Please try again later.");
  }
  let lastError = "No AI route could complete the request.";
  for (const provider of providers) {
    const body: Record<string, unknown> = {
      model: provider.model,
      messages,
      max_tokens: maxTokens,
    };
  if (request.generationConfig?.responseMimeType === "application/json") {
    body.response_format = { type: "json_object" };
  }

  for (const provider of providers) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + provider.key,
    };
    if (provider.name === "OpenRouter") {
      headers["HTTP-Referer"] = "https://expertsteam.giize.com";
      headers["X-Title"] = "ExpertsTeam ExpertAI";
    }
    const response = await fetch(provider.url, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
    if (response.ok) return parseResponse(await response.json());
    const detail = (await response.text()).slice(0, 1000);
    lastError = provider.name + " returned HTTP " + response.status + ": " + detail;
    // If a route rejects JSON mode, retry once without the optional response format.
    if (response.status === 400 && body.response_format && /response_format|json_object|unsupported parameter/i.test(detail)) {
      delete body.response_format;
      const retry = await fetch(provider.url, {
        method: "POST", headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000),
      });
      if (retry.ok) return parseResponse(await retry.json());
      lastError = provider.name + " returned HTTP " + retry.status + ": " + (await retry.text()).slice(0, 800);
    }
    // Quota, capacity and upstream failures move to the next configured route.
  }
  console.error("[ExpertAI] All configured guest routes failed:", lastError);
  throw new Error("ExpertAI is temporarily busy. Please try again in a moment.");
}

function parseResponse(value: unknown): GeminiResponse {
  const data = value as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string | { text?: string }[] | null };
    }[];
  };
  const choice = data.choices?.[0];
  const raw = choice?.message?.content;
  const text = typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("");
  if (!text?.trim()) throw new Error("OpenRouter returned an empty response.");
  return {
    candidates: [{
      finishReason: choice?.finish_reason === "length" ? "MAX_TOKENS" : "STOP",
      content: { parts: [{ text }] },
    }],
  };
}
