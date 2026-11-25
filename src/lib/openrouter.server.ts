import { compactSmartRequest } from "./smart-processing.server";
import type { GeminiRequest, GeminiResponse } from "./gemini.server";

type GatewayPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string | GatewayPart[];
};

const KILO_GATEWAY_URL = "https://ai-gateway.kilo.ai/api/v1/chat/completions";
const DEFAULT_KILO_MODEL = "openai/gpt-oss-120b";

function toMessages(request: GeminiRequest): GatewayMessage[] {
  const system = request.systemInstruction.parts.map((part) => part.text).join("\n").slice(0, 12000);
  const messages: GatewayMessage[] = [{ role: "system", content: system }];
  for (const item of request.contents.slice(-101)) {
    const parts: GatewayPart[] = [];
    for (const part of item.parts) {
      if (part.text) parts.push({ type: "text", text: part.text });
      if (part.inlineData?.data) {
        parts.push({
          type: "image_url",
          image_url: { url: "data:" + (part.inlineData.mimeType || "image/jpeg") + ";base64," + part.inlineData.data },
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

/** The single AI transport for ExpertsTeam: Kilo Gateway only, with no provider fallback. */
export async function generateKiloGatewayContent(request: GeminiRequest): Promise<GeminiResponse> {
  const activeRequest = compactSmartRequest(request);
  const body: Record<string, unknown> = {
    model: process.env["KILO_GATEWAY_MODEL"]?.trim() || DEFAULT_KILO_MODEL,
    messages: toMessages(activeRequest),
    max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 16384),
  };
  if (request.generationConfig?.responseMimeType === "application/json") {
    body.response_format = { type: "json_object" };
  }

  const send = (payload: Record<string, unknown>) => fetch(KILO_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });

  let response: Response;
  try {
    response = await send(body);
    if (response.status === 400 && body.response_format) {
      const detail = await response.clone().text();
      if (/response_format|json_object|unsupported parameter/i.test(detail)) {
        delete body.response_format;
        response = await send(body);
      }
    }
  } catch (error) {
    console.error("[Kilo Gateway] Request failed:", error);
    throw new Error(error instanceof Error && error.name === "TimeoutError"
      ? "Kilo Gateway timed out. Please try again."
      : "Kilo Gateway could not be reached. Please try again.");
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    console.error("[Kilo Gateway] HTTP", response.status, detail);
    if (response.status === 429) throw new Error("Kilo Gateway is temporarily busy (HTTP 429). Please retry shortly.");
    if (response.status === 401 || response.status === 403) throw new Error("Kilo Gateway rejected the request (HTTP " + response.status + ").");
    if (response.status >= 500) throw new Error("Kilo Gateway is temporarily unavailable (HTTP " + response.status + ").");
    throw new Error("Kilo Gateway request failed (HTTP " + response.status + "): " + detail);
  }

  const data = await response.json() as {
    choices?: { finish_reason?: string; message?: { content?: string | { text?: string }[] | null } }[];
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error("Kilo Gateway: " + data.error.message);
  const choice = data.choices?.[0];
  const raw = choice?.message?.content;
  const text = typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("");
  if (!text?.trim()) throw new Error("Kilo Gateway returned an empty response.");
  return {
    candidates: [{
      finishReason: choice?.finish_reason === "length" ? "MAX_TOKENS" : "STOP",
      content: { parts: [{ text }] },
    }],
  };
}
