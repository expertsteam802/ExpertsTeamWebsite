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

/** Shared server-side AI transport. Provider selection is controlled only by server environment variables. */
export async function generateExpertAiContent(request: GatewayRequest): Promise<GatewayResponse> {
  const activeRequest = compactSmartRequest(request);
  const provider = (process.env["EXPERTS_AI_PROVIDER"] || "kilo").trim().toLowerCase();
  const useOpenApis = provider === "openapis";
  if (provider !== "kilo" && !useOpenApis) {
    throw new Error("Unknown ExpertAI provider. Set EXPERTS_AI_PROVIDER to kilo or openapis.");
  }

  const body: Record<string, unknown> = {
    model: useOpenApis
      ? (process.env["OPENAPIS_MODEL"] || DEFAULT_OPENAPIS_MODEL).trim()
      : DEFAULT_KILO_MODEL,
    messages: toMessages(activeRequest),
    ...(useOpenApis
      ? { max_completion_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 16384) }
      : { max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 4096, 16384) }),
  };
  if (request.generationConfig?.responseMimeType === "application/json") {
    body.response_format = { type: "json_object" };
  }

  const endpoint = useOpenApis ? OPENAPIS_GATEWAY_URL : KILO_GATEWAY_URL;
  const apiKey = useOpenApis ? process.env["OPENAPIS_API_KEY"]?.trim() : undefined;
  if (useOpenApis && !apiKey) {
    throw new Error("OpenAPIs is selected but OPENAPIS_API_KEY is not configured on the server.");
  }

  const send = (payload: Record<string, unknown>) => fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(useOpenApis && apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
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
    console.error(`[${useOpenApis ? "OpenAPIs" : "Kilo Gateway"}] Request failed:`, error);
    throw new Error(error instanceof Error && error.name === "TimeoutError"
      ? `${useOpenApis ? "OpenAPIs" : "Kilo Gateway"} timed out. Please try again.`
      : `${useOpenApis ? "OpenAPIs" : "Kilo Gateway"} could not be reached. Please try again.`);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    console.error(`[${useOpenApis ? "OpenAPIs" : "Kilo Gateway"}] HTTP`, response.status, detail);
    const label = useOpenApis ? "OpenAPIs" : "Kilo Gateway";
    if (response.status === 429) throw new Error(`${label} is temporarily busy (HTTP 429). Please retry shortly.`);
    if (response.status === 401 || response.status === 403) throw new Error(`${label} rejected the configured API key or model access (HTTP ${response.status}).`);
    if (response.status >= 500) throw new Error(`${label} is temporarily unavailable (HTTP ${response.status}).`);
    throw new Error(`${label} request failed (HTTP ${response.status}): ${detail}`);
  }

  const data = await response.json() as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string | { text?: string }[] | null };
    }[];
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(`${useOpenApis ? "OpenAPIs" : "Kilo Gateway"}: ${data.error.message}`);
  const choice = data.choices?.[0];
  const raw = choice?.message?.content;
  const text = typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("");
  if (!text?.trim()) throw new Error(`${useOpenApis ? "OpenAPIs" : "Kilo Gateway"} returned an empty response.`);
  return {
    candidates: [{
      finishReason: choice?.finish_reason === "length" ? "MAX_TOKENS" : "STOP",
      content: { parts: [{ text }] },
    }],
  };
}
