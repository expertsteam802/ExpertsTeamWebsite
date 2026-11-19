import { compactSmartRequest } from "./smart-processing.server";

export type GeminiContent = {
  role: "user" | "model";
  parts: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
};
export type GeminiRequest = {
  systemInstruction: { parts: { text: string }[] };
  contents: GeminiContent[];
  generationConfig?: { responseMimeType?: "application/json"; maxOutputTokens?: number };
};
export type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
};
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

function openAiMessages(request: GeminiRequest, maxInputCharacters: number): GatewayMessage[] {
  const system = request.systemInstruction.parts.map((part) => part.text).join("\n")
    .slice(0, Math.min(6000, Math.floor(maxInputCharacters * 0.15)));
  const messages: GatewayMessage[] = [{ role: "system", content: system }];
  for (const item of request.contents.slice(-10)) {
    const parts: ContentPart[] = [];
    for (const part of item.parts) {
      if (part.text) parts.push({ type: "text", text: part.text });
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/jpeg";
        parts.push({
          type: "image_url",
          image_url: { url: "data:" + mime + ";base64," + part.inlineData.data },
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

  let remaining = Math.max(0, maxInputCharacters - system.length);
  for (let index = messages.length - 1; index >= 1; index--) {
    const message = messages[index];
    if (!message) continue;
    if (Array.isArray(message.content)) {
      const text = message.content.filter((part) => part.type === "text")
        .map((part) => part.type === "text" ? part.text : "").join("\n");
      const images = message.content.filter((part) => part.type === "image_url");
      const kept = text.slice(-remaining);
      remaining = Math.max(0, remaining - kept.length);
      message.content = [...(kept ? [{ type: "text" as const, text: kept }] : []), ...images];
    } else if (remaining <= 0) {
      messages.splice(1, index);
      break;
    } else if (message.content.length > remaining) {
      message.content = message.content.slice(-remaining);
      remaining = 0;
    } else {
      remaining -= message.content.length;
    }
  }
  return messages.filter((message) =>
    typeof message.content === "string" ? message.content.length > 0 : message.content.length > 0,
  );
}

function asGeminiResponse(text: string, finishReason = "STOP"): GeminiResponse {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] };
}
function isRetryableCapacityError(status: number, detail: string): boolean {
  if (status === 413) return true;
  if (status !== 400) return false;
  return /context length|context window|maximum context|max[_ -]?tokens|token limit|request too large|too many tokens|unsupported.*image|image.*not supported/i.test(detail);
}

/** Kilo free models vary in context, output and vision support. */
export async function generateGeminiContent(
  request: GeminiRequest,
  _apiKey?: string,
  _providerOrder?: string[],
): Promise<GeminiResponse> {
  const activeRequest = compactSmartRequest(request);
  const endpoint = (process.env["KILO_API_BASE_URL"] || "https://ai-gateway.kilo.ai/api/v1")
    .replace(/\/$/, "") + "/chat/completions";
  const apiKey = process.env["KILO_API_KEY"]?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = "Bearer " + apiKey;

  const requestedOutput = Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 8192);
  const attempts = [
    { context: 48000, output: requestedOutput },
    { context: 24000, output: Math.min(requestedOutput, 4096) },
    { context: 12000, output: Math.min(requestedOutput, 2048) },
  ];
  let lastCapacityError = "";
  for (let index = 0; index < attempts.length; index++) {
    const budget = attempts[index]!;
    const body: Record<string, unknown> = {
      model: process.env["KILO_MODEL"] || "kilo-auto/free",
      messages: openAiMessages(activeRequest, budget.context),
      max_tokens: budget.output,
    };
    if (request.generationConfig?.responseMimeType === "application/json") {
      body.response_format = { type: "json_object" };
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      if (response.status === 429) {
        throw new Error("Kilo's free-model rate limit has been reached for the current network IP. Please wait and try again later.");
      }
      if (response.status === 402 || response.status === 403) {
        throw new Error("Kilo free access is unavailable for this request (HTTP " + response.status + "). Please try again later.");
      }
      if (isRetryableCapacityError(response.status, detail) && index < attempts.length - 1) {
        lastCapacityError = detail;
        continue;
      }
      if (isRetryableCapacityError(response.status, detail)) {
        throw new Error("This free model cannot fit the current request, even after reducing context. Shorten the request or remove some attachments.");
      }
      throw new Error("Kilo Gateway HTTP " + response.status + ": " + detail);
    }
    const data = await response.json() as {
      choices?: { finish_reason?: string; message?: { content?: string | { type?: string; text?: string }[] | null } }[];
    };
    const choice = data.choices?.[0];
    const raw = choice?.message?.content;
    const output = typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("");
    if (!output?.trim()) throw new Error("Kilo returned an empty response.");
    return asGeminiResponse(output, choice?.finish_reason === "length" ? "MAX_TOKENS" : "STOP");
  }
  throw new Error("Kilo could not process this request: " + lastCapacityError);
}
