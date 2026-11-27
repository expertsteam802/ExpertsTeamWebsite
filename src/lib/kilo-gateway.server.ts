import { compactSmartRequest } from "./smart-processing.server";
export type GatewayRequest = {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] }[];
  generationConfig?: { responseMimeType?: "application/json"; maxOutputTokens?: number };
};
export type GatewayResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
};

type GatewayPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string | GatewayPart[];
};

type Provider = "openapis" | "kilo";

const KILO_GATEWAY_URL = "https://ai-gateway.kilo.ai/api/v1/chat/completions";
const DEFAULT_KILO_MODEL = "kilo-auto/free";
const OPENAPIS_GATEWAY_URL = "https://api.openapis.online/openai/v1/chat/completions";
const DEFAULT_OPENAPIS_MODEL = "gpt-5.4-mini";

function toMessages(request: GatewayRequest): GatewayMessage[] {
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

function providerLabel(provider: Provider) {
  return provider === "openapis" ? "OpenAPIs" : "Kilo Gateway";
}

function isRetryableOpenApisFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP (429|5\d\d)|timed out|could not be reached|temporarily unavailable|empty response/i.test(message);
}

async function callKilo(request: GatewayRequest): Promise<GatewayResponse> {
  const payload = {
    model: DEFAULT_KILO_MODEL,
    messages: toMessages(request),
    max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 16384),
  };
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(KILO_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
    if (response.status !== 429) break;

    // Read the provider's diagnostic before deciding whether a retry can help.
    // A shared free-model IP quota is a hard stop: retrying from this same server
    // only adds load and can make the cooldown worse.
    const detail = (await response.text()).slice(0, 1200);
    const hardQuota = /free.{0,30}models?.{0,40}(?:per\s+)?ip|(?:per\s+)?ip.{0,40}free.{0,30}models?|quota\s+(?:is\s+)?exhausted|daily\s+(?:request|token)\s+limit|insufficient\s+credits/i.test(detail);
    if (hardQuota) {
      console.warn("[Kilo Gateway] Hard free-tier quota response; skipping retries:", detail);
      throw new Error("Kilo free-model shared IP quota is exhausted (HTTP 429). Normal chat and Agent Builder share this server IP, so retrying immediately will not help. Wait for the provider's quota window to reset.");
    }
    if (attempt === 2) {
      console.error("[Kilo Gateway] HTTP 429 after temporary-rate-limit retries:", detail);
      throw new Error("Kilo Gateway is temporarily rate-limiting requests (HTTP 429) after two retries. Wait briefly before trying again.");
    }
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 4000)
      : 750 * (attempt + 1);
    console.warn("[Kilo Gateway] Temporary 429; retrying after", delayMs, "ms (attempt", attempt + 1, "of 2).");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (!response) throw new Error("Kilo Gateway did not return a response.");
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    console.error("[Kilo Gateway] HTTP", response.status, detail);
    if (response.status >= 500) throw new Error("Kilo Gateway is temporarily unavailable (HTTP " + response.status + ").");
    throw new Error("Kilo Gateway request failed (HTTP " + response.status + "): " + detail);
  }
  const data = await response.json() as {
    choices?: { finish_reason?: string; message?: { content?: string | { text?: string }[] | null } }[];
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error("Kilo Gateway: " + data.error.message);
  const raw = data.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("");
  if (!text?.trim()) throw new Error("Kilo Gateway returned an empty response.");
  return {
    candidates: [{
      finishReason: data.choices?.[0]?.finish_reason === "length" ? "MAX_TOKENS" : "STOP",
      content: { parts: [{ text }] },
    }],
  };
}

/**
 * OpenAPIs is called with genuine upstream SSE. We consume its events here and
 * adapt the completed text to the existing Gemini-shaped server contract.
 * This qualifies as a streaming request at the provider while keeping callers stable.
 */
async function callOpenApis(request: GatewayRequest): Promise<GatewayResponse> {
  const apiKey = process.env["OPENAPIS_API_KEY"]?.trim();
  if (!apiKey) throw new Error("OpenAPIs is selected but OPENAPIS_API_KEY is not configured on the server.");
  const payload: Record<string, unknown> = {
    model: (process.env["OPENAPIS_MODEL"] || DEFAULT_OPENAPIS_MODEL).trim(),
    messages: toMessages(request),
    stream: true,
    max_completion_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 16384),
  };
  if (request.generationConfig?.responseMimeType === "application/json") {
    payload.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(OPENAPIS_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    console.error("[OpenAPIs] Streaming request failed:", error);
    throw new Error(error instanceof Error && error.name === "TimeoutError"
      ? "OpenAPIs timed out."
      : "OpenAPIs could not be reached.");
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    console.error("[OpenAPIs] HTTP", response.status, detail);
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenAPIs rejected the configured API key or model access (HTTP " + response.status + ").");
    }
    if (response.status === 429) throw new Error("OpenAPIs is temporarily busy (HTTP 429).");
    if (response.status >= 500) {
      const statusLabel = response.statusText ? " " + response.statusText : "";
      const diagnostic = detail.replace(/\\s+/g, " ").slice(0, 700);
      throw new Error(
        "OpenAPIs is temporarily unavailable (HTTP " + response.status + statusLabel + ")." +
        (diagnostic ? " Upstream detail: " + diagnostic : " The upstream gateway returned no error details."),
      );
    }
    // Some OpenAI-compatible gateways reject max_completion_tokens. Retry once
    // with the widely supported max_tokens parameter before treating it as a failure.
    if (response.status === 400 && /max_completion_tokens|unsupported parameter/i.test(detail)) {
      delete payload.max_completion_tokens;
      payload.max_tokens = Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 16384);
      response = await fetch(OPENAPIS_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) {
        const retryDetail = (await response.text()).slice(0, 1000);
        throw new Error("OpenAPIs request failed (HTTP " + response.status + "): " + retryDetail);
      }
    } else {
      throw new Error("OpenAPIs request failed (HTTP " + response.status + "): " + detail);
    }
  }

  if (!response.body) throw new Error("OpenAPIs returned no streaming response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let finishReason = "STOP";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let chunk: {
          choices?: { delta?: { content?: string | { text?: string }[] | null }; finish_reason?: string | null }[];
          error?: { message?: string };
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error?.message) throw new Error("OpenAPIs: " + chunk.error.message);
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === "string") answer += delta;
        else if (Array.isArray(delta)) answer += delta.map((part) => part.text ?? "").join("");
        if (choice?.finish_reason === "length") finishReason = "MAX_TOKENS";
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const dataLine = buffer.split("\n").find((line) => line.startsWith("data:"));
      const data = dataLine?.slice(5).trim();
      if (data && data !== "[DONE]") {
        try {
          const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] };
          answer += chunk.choices?.[0]?.delta?.content ?? "";
          if (chunk.choices?.[0]?.finish_reason === "length") finishReason = "MAX_TOKENS";
        } catch { /* Ignore a final incomplete SSE frame. */ }
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!answer.trim()) throw new Error("OpenAPIs returned an empty streaming response.");
  return { candidates: [{ finishReason, content: { parts: [{ text: answer }] } }] };
}

/** Shared server-side AI transport. Provider selection and credentials are server-only. */
export async function generateExpertAiContent(
  request: GatewayRequest,
  options: { provider?: Provider; fallbackToKilo?: boolean } = {},
): Promise<GatewayResponse> {
  const activeRequest = compactSmartRequest(request);
  const provider = options.provider ?? "kilo";
  if (provider !== "kilo" && provider !== "openapis") {
    throw new Error("Unknown ExpertAI provider. Set EXPERTS_AI_PROVIDER to kilo or openapis.");
  }

  if (provider === "kilo") return callKilo(activeRequest);

  try {
    return await callOpenApis(activeRequest);
  } catch (error) {
    // Chat can disable fallback during provider validation so test results cannot be masked.
    if (options.fallbackToKilo === false || !isRetryableOpenApisFailure(error)) throw error;
    console.warn("[ExpertAI] OpenAPIs failed transiently; falling back to Kilo Gateway:", error);
    return callKilo(activeRequest);
  }
}
