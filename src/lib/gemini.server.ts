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
  let response = await send(isGroq ? 6500 : 10000, Math.min(requestedOutput, isGroq ? 1100 : 1800));
  // Groq may reject an otherwise valid request when its TPM window is tight.
  // Retry the same provider once with a materially smaller context/output budget.
  if (isGroq && response.status === 413) {
    await response.text();
    response = await send(4200, Math.min(requestedOutput, 600));
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
    (process.env["AI_PROVIDER_ORDER"] || "groq,gemini,openrouter")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  const availableProviders = ["groq", "gemini", "openrouter", "mistral", "cloudflare"];
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
      if (provider === "groq" || provider === "openrouter") {
        return await callOpenAiCompatible(provider, activeRequest);
      }
      if (provider === "mistral") return await callMistral(activeRequest);
      if (provider === "cloudflare") return await callCloudflare(activeRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "not_configured") continue;
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
      else if (/HTTP 5\d\d|timed out|timeout/i.test(message)) markProviderCoolingDown(provider, 20);
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
