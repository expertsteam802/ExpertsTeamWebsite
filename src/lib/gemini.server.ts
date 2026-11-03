export type GeminiContent = {
  role: "user" | "model";
  parts: { text: string }[];
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
  process.env["GEMINI_CODE_MODEL"] || process.env["GEMINI_MODEL"] || "gemini-3.6-flash";
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

function openAiMessages(request: GeminiRequest) {
  return [
    {
      role: "system",
      content: request.systemInstruction.parts.map((part) => part.text).join("\n"),
    },
    ...request.contents.map((item) => ({
      role: item.role === "model" ? "assistant" : "user",
      content: item.parts.map((part) => part.text).join("\n"),
    })),
  ];
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
  const response = await fetch(
    isGroq
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(isGroq
          ? {}
          : {
              "HTTP-Referer": process.env["APP_URL"] || "https://expertsteam.giize.com",
              "X-Title": "ExpertsTeam",
            }),
      },
      body: JSON.stringify({
        model,
        messages: openAiMessages(request),
        max_tokens: request.generationConfig?.maxOutputTokens ?? 8192,
        ...(request.generationConfig?.responseMimeType === "application/json"
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
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
  const configuredOrder =
    providerOrder ??
    (process.env["AI_PROVIDER_ORDER"] || "gemini,groq,mistral,openrouter,cloudflare")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
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
            body: JSON.stringify(request),
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
        return await callOpenAiCompatible(provider, request);
      }
      if (provider === "mistral") return await callMistral(request);
      if (provider === "cloudflare") return await callCloudflare(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "not_configured") continue;
      if (/HTTP 429|rate.?limit|quota|RESOURCE_EXHAUSTED/i.test(message))
        markProviderCoolingDown(provider, 60);
      else if (/HTTP 401|HTTP 403|HTTP 404/i.test(message))
        markProviderCoolingDown(provider, 300);
      else if (/HTTP 5\d\d|timed out|timeout/i.test(message))
        markProviderCoolingDown(provider, 20);
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
    throw new Error(`All configured free AI providers are unavailable. ${details.join(" | ")}`);
  }
  throw new Error(
    "No AI provider is configured. Add at least one server-side API key in Vercel Environment Variables.",
  );
}
