import { compactSmartRequest } from "./smart-processing.server";

export type GeminiContent = {
  role: "user" | "model";
  parts: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
};

export type GeminiRequest = {
  systemInstruction: { parts: { text: string }[] };
  contents: GeminiContent[];
  generationConfig?: {
    responseMimeType?: "application/json";
    maxOutputTokens?: number;
  };
};

export type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  promptFeedback?: { blockReason?: string };
};

function openAiMessages(request: GeminiRequest, maxInputCharacters = 48000) {
  const system = request.systemInstruction.parts.map((part) => part.text).join("\n")
    .slice(0, Math.min(6000, Math.floor(maxInputCharacters * 0.15)));
  const recent = request.contents.slice(-10).map((item) => ({
    role: item.role === "model" ? "assistant" : "user",
    content: item.parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("\n"),
  }));
  const messages = [{ role: "system", content: system }, ...recent];
  let remaining = Math.max(0, maxInputCharacters - system.length);
  for (let index = messages.length - 1; index >= 1; index--) {
    const message = messages[index];
    if (remaining <= 0) {
      messages.splice(1, index);
      break;
    }
    if (message.content.length > remaining) {
      message.content = message.content.slice(-remaining);
      remaining = 0;
    } else {
      remaining -= message.content.length;
    }
  }
  return messages.filter((message) => message.content.length > 0);
}

function asGeminiResponse(text: string, finishReason = "STOP"): GeminiResponse {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] };
}

/**
 * ExpertAI uses Kilo Gateway only. No server API key is required for
 * Kilo's anonymous free-model tier. Requests made here originate from
 * the hosting server, so Kilo's IP-based quota may be shared by visitors.
 */
export async function generateGeminiContent(
  request: GeminiRequest,
  _apiKey?: string,
  _providerOrder?: string[],
): Promise<GeminiResponse> {
  const activeRequest = compactSmartRequest(request);
  if (activeRequest.contents.some((item) => item.parts.some((part) => Boolean(part.inlineData?.data)))) {
    throw new Error("Kilo text chat cannot process image attachments through this text-only adapter yet. Please attach a text-based document instead.");
  }

  const endpoint = (process.env["KILO_API_BASE_URL"] || "https://ai-gateway.kilo.ai/api/v1")
    .replace(/\/$/, "") + "/chat/completions";
  const apiKey = process.env["KILO_API_KEY"]?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env["KILO_MODEL"] || "kilo-auto/free",
      messages: openAiMessages(activeRequest),
      max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 8192, 8192),
      ...(request.generationConfig?.responseMimeType === "application/json"
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    if (response.status === 429) {
      throw new Error("Kilo's free-model rate limit has been reached for the current network IP. Please wait and try again later.");
    }
    if (response.status === 402 || response.status === 403) {
      throw new Error(`Kilo free access is unavailable for this request (HTTP ${response.status}). Please try again later.`);
    }
    throw new Error(`Kilo Gateway HTTP ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string | { type?: string; text?: string }[] | null } }[];
  };
  const choice = data.choices?.[0];
  const rawOutput = choice?.message?.content;
  const output = typeof rawOutput === "string" ? rawOutput : rawOutput?.map((part) => part.text ?? "").join("");
  if (!output) throw new Error("Kilo returned an empty response.");
  return asGeminiResponse(output, choice?.finish_reason === "length" ? "MAX_TOKENS" : "STOP");
}
