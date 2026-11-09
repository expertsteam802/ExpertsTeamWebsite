import { isIP } from "node:net";
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

const GEMINI_MODEL =
  process.env["GEMINI_CODE_MODEL"] || process.env["GEMINI_MODEL"] || "gemini-3.8-flash";
const providerCooldowns = new Map<string, number>();

export function markProviderCoolingDown(provider: string, seconds = 60) {
  providerCooldowns.set(provider, Date.now() + Math.max(5, Math.min(seconds, 300)) * 1000);
}

export function isProviderCoolingDown(provider: string) {
  return (providerCooldowns.get(provider) ?? 0) > Date.now();
}

export function resetProviderCooldowns() {
  providerCooldowns.clear();
}

export function resolveGeminiApiKey(apiKey?: string): string | undefined {
  return apiKey?.trim() || process.env["GEMINI_API_KEY"]?.trim() || undefined;
}

function openAiMessages(request: GeminiRequest, maxInputCharacters = 10000) {
  // Smart Processing compacts the request first; this is the final adapter guard.
  const system = request.systemInstruction.parts
    .map((part) => part.text)
    .join("\n")
    .slice(0, Math.min(1800, Math.floor(maxInputCharacters * 0.3)));
  const recent = request.contents.slice(-4).map((item, index, items) => ({
    role: item.role === "model" ? "assistant" : "user",
    content: item.parts
      .map((part) => part.text ?? "")
      .join("\n")
      .slice(-(index === items.length - 1 ? 7200 : 700)),
  }));
  const messages = [{ role: "system", content: system }, ...recent];
  let remaining = maxInputCharacters - system.length;
  for (let index = messages.length - 1; index >= 1; index--) {
    const message = messages[index];
    if (message.content.length > remaining) {
      message.content = message.content.slice(-Math.max(0, remaining));
    }
    remaining -= message.content.length;
    if (remaining <= 0) {
      messages.splice(1, index - 1);
      break;
    }
  }
  return messages.filter((message) => message.content.length > 0);
}

function asGeminiResponse(text: string): GeminiResponse {
  return { candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] };
}

async function callOpenAiCompatible(
  provider: "groq" | "openrouter",
  request: GeminiRequest,
): Promise<GeminiResponse> {
  const isGroq = provider === "groq";
  const apiKey = process.env[isGroq ? "GROQ_API_KEY" : "OPENROUTER_API_KEY"]?.trim();
  if (!apiKey) throw new Error("not_configured");
  const model =
    process.env[isGroq ? "GROQ_MODEL" : "OPENROUTER_MODEL"] ||
    (isGroq ? "openai/gpt-oss-120b" : "openrouter/free");
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(isGroq
      ? {}
      : {
          "HTTP-Referer": process.env["APP_URL"] || "https://expertsteam.giize.com",
          "X-Title": "ExpertsTeam",
        }),
  };
  const send = (inputBudget: number, outputBudget: number) =>
    fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: openAiMessages(request, inputBudget),
        max_tokens: outputBudget,
        ...(request.generationConfig?.responseMimeType === "application/json"
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: AbortSignal.timeout(isGroq ? 30000 : 60000),
    });
  const requestedOutput = request.generationConfig?.maxOutputTokens ?? 1800;
  let response = await send(isGroq ? 3800 : 10000, Math.min(requestedOutput, isGroq ? 700 : 1800));
  // Groq may reject an otherwise valid request when its TPM window is tight.
  // Retry the same provider once with a materially smaller context/output budget.
  if (isGroq && response.status === 413) {
    await response.text();
    response = await send(2400, Math.min(requestedOutput, 400));
  }
  if (!response.ok)
    throw new Error(
      `${provider} HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error(`${provider} returned an empty response.`);
  return asGeminiResponse(output);
}

async function callMistral(request: GeminiRequest): Promise<GeminiResponse> {
  const apiKey = process.env["MISTRAL_API_KEY"]?.trim();
  if (!apiKey) throw new Error("not_configured");
  const model = process.env["MISTRAL_MODEL"] || "mistral-small-latest";
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: openAiMessages(request),
      max_tokens: request.generationConfig?.maxOutputTokens ?? 8192,
      ...(request.generationConfig?.responseMimeType === "application/json"
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error(`Mistral HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error("Mistral returned an empty response.");
  return asGeminiResponse(output);
}

async function callCloudflare(request: GeminiRequest): Promise<GeminiResponse> {
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"]?.trim();
  if (!accountId || !apiToken) throw new Error("not_configured");
  const model = process.env["CLOUDFLARE_AI_MODEL"] || "@cf/zai-org/glm-4.7-flash";
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: openAiMessages(request),
        max_tokens: request.generationConfig?.maxOutputTokens ?? 8192,
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Cloudflare Workers AI HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const data = (await response.json()) as { result?: { response?: string } };
  if (!data.result?.response) throw new Error("Cloudflare Workers AI returned an empty response.");
  return asGeminiResponse(data.result.response);
}


type OllamaConfig = { endpoint: string; model: string; apiKey?: string } | null;
let ollamaConfigCache: { expiresAt: number; value: OllamaConfig } | null = null;
let ollamaMissingConfigLogged = false;

async function resolveOllamaConfig(): Promise<OllamaConfig> {
  if (ollamaConfigCache && ollamaConfigCache.expiresAt > Date.now()) {
    return ollamaConfigCache.value;
  }

  const supabaseUrl = (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "").trim();
  const serviceKey = (
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SERVICE_ROLE_KEY"] ||
    ""
  ).trim();
  if (!supabaseUrl || !serviceKey) {
    if (!ollamaMissingConfigLogged) {
      console.warn("[ExpertAI] Cannot read Qwen/Ollama settings: server-side Supabase credentials are unavailable; provider fallback is active.");
      ollamaMissingConfigLogged = true;
    }
    ollamaConfigCache = { value: null, expiresAt: Date.now() + 15000 };
    return null;
  }

  const settingsUrl = new URL("/rest/v1/site_settings?select=ad_settings&id=eq.1", supabaseUrl);
  const response = await fetch(settingsUrl, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Ollama configuration lookup failed (HTTP ${response.status}).`);
  const rows = (await response.json()) as Array<{
    ad_settings?: { siteBranding?: { ollama_url?: unknown } } | null;
  }>;
  const rawEndpoint = rows[0]?.ad_settings?.siteBranding?.ollama_url;
  if (typeof rawEndpoint !== "string" || !rawEndpoint.trim()) {
    if (!ollamaMissingConfigLogged) {
      console.info("[ExpertAI] Qwen/Ollama endpoint is empty; provider fallback is active.");
      ollamaMissingConfigLogged = true;
    }
    ollamaConfigCache = { value: null, expiresAt: Date.now() + 15000 };
    return null;
  }
  ollamaMissingConfigLogged = false;

  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint.trim());
  } catch {
    throw new Error("The configured Qwen/Ollama endpoint is not a valid URL.");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const localHost =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal";
  const allowLocalDevelopment =
    process.env["NODE_ENV"] !== "production" && parsed.protocol === "http:" && localHost;
  if (
    (parsed.protocol !== "https:" && !allowLocalDevelopment) ||
    isIP(hostname) !== 0 ||
    (localHost && !allowLocalDevelopment) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("The configured Qwen/Ollama endpoint must be a public HTTPS URL without credentials or query parameters.");
  }

  const basePath = parsed.pathname.replace(/\/+$/, "");
  if (basePath.endsWith("/v1/chat/completions")) {
    parsed.pathname = basePath;
  } else if (basePath.endsWith("/v1")) {
    parsed.pathname = basePath + "/chat/completions";
  } else {
    parsed.pathname = basePath + "/v1/chat/completions";
  }
  parsed.search = "";
  parsed.hash = "";

  const value: OllamaConfig = {
    endpoint: parsed.toString(),
    model: process.env["OLLAMA_MODEL"]?.trim() || "qwen2.5:7b-instruct",
    ...(process.env["OLLAMA_API_KEY"]?.trim()
      ? { apiKey: process.env["OLLAMA_API_KEY"].trim() }
      : {}),
  };
  // A short cache lets an admin change only the Supabase URL setting without a redeploy.
  ollamaConfigCache = { value, expiresAt: Date.now() + 15000 };
  return value;
}

export async function isOllamaConfigured(): Promise<boolean> {
  try {
    return Boolean(await resolveOllamaConfig());
  } catch (error) {
    console.warn("[ExpertAI] Qwen/Ollama configuration is unavailable; provider fallback is active.", {
      reason: error instanceof Error && /HTTP 5\\d\\d|fetch failed|timeout|network/i.test(error.message)
        ? "configuration_service_unavailable"
        : "invalid_endpoint_configuration",
    });
    return false;
  }
}

async function callOllama(request: GeminiRequest): Promise<GeminiResponse> {
  const config = await resolveOllamaConfig();
  if (!config) throw new Error("not_configured");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "bypass-tunnel-reminder": "true",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: openAiMessages(request),
      max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 1800, 2400),
      stream: false,
      ...(request.generationConfig?.responseMimeType === "application/json"
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Qwen/Ollama HTTP ${response.status}.`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error("Qwen/Ollama returned an empty response.");
  console.info("[ExpertAI] Qwen/Ollama coding-agent inference completed.");
  return asGeminiResponse(output);
}

/** Stream OpenAI-compatible Qwen/Ollama deltas as the Gemini-shaped SSE events used by ExpertAI. */
export async function streamOllamaContent(
  request: GeminiRequest,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array> | null> {
  if (request.contents.some((item) => item.parts.some((part) => Boolean(part.inlineData?.data)))) {
    return null;
  }
  const config = await resolveOllamaConfig();
  if (!config) return null;
  const upstream = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "bypass-tunnel-reminder": "true",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: openAiMessages(compactSmartRequest(request)),
      max_tokens: Math.min(request.generationConfig?.maxOutputTokens ?? 700, 1800),
      stream: true,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(65000)])
      : AbortSignal.timeout(65000),
  });
  if (!upstream.ok) {
    await upstream.body?.cancel();
    throw new Error(`Qwen/Ollama HTTP ${upstream.status}.`);
  }
  if (!upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) {
    await upstream.body?.cancel();
    throw new Error("The configured ExpertAI service does not support token streaming.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let finished = false;
  let sawToken = false;
  const emitLine = (line: string, controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
    if (!data) return false;
    if (data === "[DONE]") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      return true;
    }
    try {
      const event = JSON.parse(data) as {
        choices?: { delta?: { content?: string | null } }[];
      };
      const text = event.choices?.[0]?.delta?.content;
      if (typeof text === "string" && text) {
        if (!sawToken) {
          sawToken = true;
          console.info("[ExpertAI] Qwen/Ollama chat stream produced its first token.");
        }
        controller.enqueue(
          encoder.encode(
            "data: " +
              JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) +
              "\n\n",
          ),
        );
      }
    } catch {
      // Ignore non-JSON SSE lines; the next complete data event remains usable.
    }
    return false;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            const emittedDone = buffer.trim() ? emitLine(buffer.trim(), controller) : false;
            if (!emittedDone) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            finished = true;
            if (sawToken) console.info("[ExpertAI] Qwen/Ollama chat stream completed.");
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (emitLine(line, controller)) {
              finished = true;
              await reader.cancel();
              console.info("[ExpertAI] Qwen/Ollama chat stream completed.");
              controller.close();
              return;
            }
          }
          if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
        }
      } catch (error) {
        finished = true;
        const message =
          error instanceof Error && error.name === "TimeoutError"
            ? "ExpertAI timed out while generating a response. Please try again."
            : "ExpertAI's response stream disconnected before completion. Please retry.";
        controller.error(new Error(message));
      }
    },
    async cancel(reason) {
      finished = true;
      await reader.cancel(reason);
    },
  });
}

export async function generateGeminiContent(
  request: GeminiRequest,
  apiKey?: string,
  providerOrder?: string[],
): Promise<GeminiResponse> {
  let activeRequest = compactSmartRequest(request);
  const hasImageReference = activeRequest.contents.some((item) =>
    item.parts.some((part) => Boolean(part.inlineData?.data)),
  );
  if (hasImageReference && !resolveGeminiApiKey(apiKey)) {
    throw new Error(
      "Screenshot-to-app generation needs the Gemini vision connection. Add GEMINI_API_KEY in the deployment environment.",
    );
  }
  const requestedOrder =
    providerOrder ??
    (process.env["AI_PROVIDER_ORDER"] || "ollama,groq,gemini,openrouter")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  const availableProviders = ["ollama", "groq", "gemini", "openrouter", "mistral", "cloudflare"];
  // Use every configured adapter as a fallback; credentials stay server-side.
  const configuredOrder = hasImageReference
    ? ["gemini"]
    : [
        ...new Set([
          ...requestedOrder.filter((item) => availableProviders.includes(item)),
          ...availableProviders,
        ]),
      ];
  const failures: string[] = [];
  const coolingDown: string[] = [];

  for (const provider of configuredOrder) {
    if (isProviderCoolingDown(provider)) {
      coolingDown.push(provider);
      continue;
    }
    try {
      if (provider === "gemini") {
        const resolvedApiKey = resolveGeminiApiKey(apiKey);
        if (!resolvedApiKey) continue;
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": resolvedApiKey, "Content-Type": "application/json" },
            body: JSON.stringify(activeRequest),
            signal: AbortSignal.timeout(45000),
          },
        );
        if (!response.ok)
          throw new Error(
            `Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
          );
        return (await response.json()) as GeminiResponse;
      }
      if (provider === "ollama") return await callOllama(activeRequest);
      if (provider === "groq" || provider === "openrouter") {
        return await callOpenAiCompatible(provider, activeRequest);
      }
      if (provider === "mistral") return await callMistral(activeRequest);
      if (provider === "cloudflare") return await callCloudflare(activeRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "not_configured") continue;
      if (provider === "ollama") {
        const reason = /fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|network/i.test(message)
          ? "tunnel_or_network_unavailable"
          : /HTTP 401|HTTP 403|HTTP 404/i.test(message)
            ? "endpoint_or_model_rejected"
            : "inference_failed";
        console.warn("[ExpertAI] Qwen/Ollama unavailable; trying provider fallback.", { reason });
      }
      if (
        /HTTP 413|HTTP 429|rate.?limit|quota|RESOURCE_EXHAUSTED|tokens per minute/i.test(message)
      ) {
        markProviderCoolingDown(provider, 60);
        // Give the next provider a smaller prompt and output reserve automatically.
        activeRequest = compactSmartRequest(
          {
            ...activeRequest,
            generationConfig: {
              ...activeRequest.generationConfig,
              maxOutputTokens: Math.min(
                activeRequest.generationConfig?.maxOutputTokens ?? 1400,
                700,
              ),
            },
          },
          4500,
        );
      } else if (/HTTP 401|HTTP 403|HTTP 404/i.test(message))
        markProviderCoolingDown(provider, 300);
      else if (/HTTP 5\d\d|timed out|timeout|fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|network/i.test(message)) markProviderCoolingDown(provider, 20);
      failures.push(`${provider}: ${message}`);
    }
  }

  if (failures.length || coolingDown.length) {
    const details = [
      ...failures,
      ...coolingDown.map(
        (provider) => `${provider}: temporarily cooling down after a provider limit or outage`,
      ),
    ];
    throw new Error(
      `All configured ExpertAI services are temporarily unavailable. ${details.join(" | ")}`,
    );
  }
  throw new Error(
    "ExpertAI is not connected yet. Add at least one server-side service key in the hosting environment.",
  );
}
