type GeminiContent = {
  role: "user" | "model";
  parts: { text: string }[];
};

type GeminiRequest = {
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

const GEMINI_MODEL = "gemini-3.5-flash-lite";

export function resolveGeminiApiKey(apiKey?: string): string | undefined {
  return (
    apiKey?.trim() ||
    process.env["GEMINI_API_KEY"]?.trim() ||
    process.env["VITE_GEMINI_API_KEY"]?.trim() ||
    undefined
  );
}

export async function generateGeminiContent(
  request: GeminiRequest,
  apiKey?: string,
): Promise<GeminiResponse> {
  const resolvedApiKey = resolveGeminiApiKey(apiKey);

  if (!resolvedApiKey) {
    throw new Error(
      "Chris AI is not configured. Set GEMINI_API_KEY in the server environment. VITE_GEMINI_API_KEY is supported only for local development.",
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": resolvedApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Gemini took too long to respond. Please try again.");
    }
    throw new Error(
      "Could not connect to Gemini from the server. Check the server's network connection.",
    );
  }

  if (response.status === 429) {
    throw new Error(
      "Gemini is rate limited or out of quota. Check the API key's quota and try again later.",
    );
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new Error(
      "Gemini rejected the server API key or request. Check the key, model access, and API restrictions.",
    );
  }
  if (response.status === 404) {
    throw new Error(
      `Gemini model ${GEMINI_MODEL} was not found or is unavailable to this API key.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Gemini could not finish that request (HTTP ${response.status}). Please try again.`,
    );
  }

  return (await response.json()) as GeminiResponse;
}
