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

/** Guest ExpertAI uses OpenRouter from the server; its key is never sent to browsers. */
export async function generateOpenRouterContent(request: GeminiRequest): Promise<GeminiResponse> {
  const apiKey = process.env["OPENROUTER_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("Guest AI is not configured yet. Add OPENROUTER_API_KEY as a server-only Vercel environment variable.");
  }

  const activeRequest = compactSmartRequest(request);
  const body: Record<string, unknown> = {
    model: process.env["OPENROUTER_MODEL"]?.trim() || "openrouter/free",
    messages: toMessages(activeRequest),
    max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 8192),
  };
  if (request.generationConfig?.responseMimeType === "application/json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "HTTP-Referer": "https://expertsteam.giize.com",
      "X-Title": "ExpertsTeam ExpertAI",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    if (response.status === 429) {
      throw new Error("OpenRouter free-model rate limit reached. Please wait and try again.");
    }
    if (response.status === 402 || response.status === 403) {
      throw new Error("OpenRouter rejected the guest AI request. Check the server API key and account limits.");
    }
    if (response.status === 400 && /response_format|json_object|unsupported parameter/i.test(detail)) {
      delete body.response_format;
      const retry = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
          "HTTP-Referer": "https://expertsteam.giize.com",
          "X-Title": "ExpertsTeam ExpertAI",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000),
      });
      if (!retry.ok) throw new Error("OpenRouter HTTP " + retry.status + ": " + (await retry.text()).slice(0, 800));
      return parseResponse(await retry.json());
    }
    throw new Error("OpenRouter HTTP " + response.status + ": " + detail);
  }
  return parseResponse(await response.json());
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
